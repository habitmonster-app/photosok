'use strict';
// 스티커 만들기: 사진에서 사람(또는 얼굴만 타원으로)을 오려 투명 배경 PNG로 만든다. 흰 테두리·색감을 고를 수 있다.
// 사람 찾기는 기기 안의 MediaPipe 로만 한다. 만든 스티커는 "내 스티커"(이 기기)에 넣거나 PNG로 저장한다.
(() => {
  const $ = id => document.getElementById(id);
  const MODES = [{ id: 'person', name: '사람 오려내기' }, { id: 'face', name: '얼굴만 동그랗게' }];
  const BORDERS = [{ id: 0, name: '없음' }, { id: 1, name: '얇게' }, { id: 2, name: '두껍게' }];
  const TONES = [
    { id: 'none', name: '기본', f: 'none' }, { id: 'bright', name: '화사한', f: 'brightness(1.08) saturate(1.12) contrast(.96)' },
    { id: 'pure', name: '청순한', f: 'brightness(1.1) saturate(.8) contrast(.92)' }, { id: 'warm', name: '따뜻한', f: 'sepia(.18) saturate(1.15) brightness(1.04)' },
    { id: 'autumn', name: '가을날', f: 'sepia(.35) saturate(1.25) contrast(1.05) brightness(.98)' }, { id: 'mono', name: '흑백', f: 'grayscale(1) contrast(1.1)' },
  ];
  let dialog = null, s = null, pending = false;

  function build() {
    dialog = document.createElement('dialog');
    dialog.id = 'stickerDialog';
    dialog.innerHTML = `
      <div class="dialog-head"><h2>스티커 만들기</h2><button type="button" class="icon-button" id="smClose" aria-label="스티커 만들기 닫기"><svg><use href="#i-close"/></svg></button></div>
      <div class="sm-stage" id="smStage"><canvas id="smSource" aria-label="원본 사진"></canvas><canvas id="smOut" aria-label="만든 스티커"></canvas><p class="sm-busy" id="smBusy" hidden>사람을 찾는 중…</p></div>
      <p class="text-hint" id="smHint"></p>
      <div class="text-row" id="smModes" role="group" aria-label="오리는 방식">${MODES.map(m => `<button type="button" data-smmode="${m.id}">${m.name}</button>`).join('')}</div>
      <label class="crop-zoom" id="smSizeRow"><span>크기</span><input type="range" id="smSize" min="60" max="200" step="1" aria-label="타원 크기"></label>
      <p class="deco-label">흰 테두리</p>
      <div class="text-row" role="group" aria-label="흰 테두리">${BORDERS.map(b => `<button type="button" data-smborder="${b.id}">${b.name}</button>`).join('')}</div>
      <p class="deco-label">색감</p>
      <div class="sm-tones" id="smTones" role="group" aria-label="색감"></div>
      <p class="mask-note">사진은 폰 안에서만 오려요. 사람이 또렷하고 배경과 구분될수록 깔끔하게 오려져요.</p>
      <div class="crop-actions"><button type="button" class="small-button" id="smPng">PNG로 저장</button><button type="button" class="primary" id="smKeep">내 스티커에 넣기</button></div>`;
    document.body.append(dialog);
    $('smClose').onclick = () => dialog.close();
    dialog.addEventListener('close', () => { if (s) { s.src.width = s.src.height = 1; s.cut = null; } s = null; });
    dialog.querySelectorAll('[data-smmode]').forEach(b => b.onclick = () => { s.mode = b.dataset.smmode; refresh(); });
    dialog.querySelectorAll('[data-smborder]').forEach(b => b.onclick = () => { s.border = Number(b.dataset.smborder); render(); });
    $('smSize').oninput = () => { s.oval.k = $('smSize').value / 100; render(); };
    $('smPng').onclick = () => finish(false);
    $('smKeep').onclick = () => finish(true);
    // 얼굴 타원은 원본 그림 위에서 끌어 옮긴다
    const src = $('smSource'); let last = null;
    src.addEventListener('pointerdown', e => { if (s?.mode !== 'face') return; src.setPointerCapture(e.pointerId); last = { x: e.clientX, y: e.clientY }; });
    src.addEventListener('pointermove', e => {
      if (!last || !s) return; const r = src.getBoundingClientRect();
      s.oval.cx = Math.min(1, Math.max(0, s.oval.cx + (e.clientX - last.x) / r.width)); s.oval.cy = Math.min(1, Math.max(0, s.oval.cy + (e.clientY - last.y) / r.height));
      last = { x: e.clientX, y: e.clientY }; render();
    });
    const end = () => { last = null; }; src.addEventListener('pointerup', end); src.addEventListener('pointercancel', end);
  }

  async function open(item) {
    if (!item || state.busy) return;
    if (!dialog) build();
    try {
      const input = await itemInputFile(item);
      const src = await PhotoSokFace.orientedCanvas(input, item.sourceType === 'pdf' ? 0 : (item.rotation || 0), 1600);
      s = { item, src, mode: 'person', border: 2, tone: 'none', cut: null, oval: { cx: .5, cy: .42, rx: .28, ry: .36, k: 1 }, face: null };
    } catch (e) { toast(errText(e, '사진을 열지 못했어요. 다시 시도해주세요.'), true); return; }
    // 색감 미리보기 칸
    const tones = $('smTones'); tones.replaceChildren();
    const t = document.createElement('canvas'), k = 64 / Math.max(s.src.width, s.src.height); t.width = Math.round(s.src.width * k); t.height = Math.round(s.src.height * k);
    for (const tone of TONES) {
      const x = t.getContext('2d'); x.filter = tone.f; x.drawImage(s.src, 0, 0, t.width, t.height); x.filter = 'none';
      const b = document.createElement('button'); b.type = 'button'; b.dataset.smtone = tone.id;
      const img = document.createElement('img'); img.alt = ''; img.src = t.toDataURL('image/jpeg', .8);
      const span = document.createElement('span'); span.textContent = tone.name; b.append(img, span);
      b.onclick = () => { s.tone = tone.id; render(); }; tones.append(b);
    }
    const sc = $('smSource'); sc.width = s.src.width; sc.height = s.src.height;
    dialog.showModal();
    refresh();
  }

  // 오리기 방식이 바뀌면 사람·얼굴을 다시 찾는다 (한 번 찾은 결과는 보관)
  async function refresh() {
    const cur = s; if (!cur) return;
    sync();
    $('smBusy').hidden = false; $('smKeep').disabled = $('smPng').disabled = true;
    try {
      if (cur.mode === 'person' && !cur.cut) cur.cut = await PhotoSokFace.cutout(cur.src, 600);
      if (cur.mode === 'face' && !cur.face) {
        const r = await PhotoSokFace.detect(cur.src); cur.face = r.faces[0] || false;
        if (cur.face) { const f = cur.face; cur.oval = { cx: f.cx, cy: (f.crownY + f.chinY) / 2, rx: (f.right - f.left) / 2 * 1.12, ry: (f.chinY - f.crownY) / 2 * 1.08, k: 1 }; }
        else toast('얼굴을 찾지 못했어요. 타원을 끌어서 맞춰주세요.', true);
      }
    } catch (e) {
      if (cur === s) { toast(errText(e, '사람을 찾지 못했어요. 다른 사진으로 해보세요.'), true); if (cur.mode === 'person') { cur.mode = 'face'; cur.face = false; } }
    } finally { if (cur === s) { $('smBusy').hidden = true; $('smKeep').disabled = $('smPng').disabled = false; sync(); render(); } }
  }

  function sync() {
    dialog.querySelectorAll('[data-smmode]').forEach(b => { const on = b.dataset.smmode === s.mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    dialog.querySelectorAll('[data-smborder]').forEach(b => { const on = Number(b.dataset.smborder) === s.border; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    dialog.querySelectorAll('[data-smtone]').forEach(b => { const on = b.dataset.smtone === s.tone; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    $('smSizeRow').hidden = s.mode !== 'face'; $('smSize').value = Math.round(s.oval.k * 100);
    $('smSource').style.cursor = s.mode === 'face' ? 'move' : 'default';
    $('smHint').textContent = s.mode === 'face' ? '왼쪽 사진에서 점선 타원을 끌어 얼굴에 맞추고, 크기를 조절해요.' : '사람만 남기고 배경을 지웠어요. 오른쪽이 만들어질 스티커예요.';
  }

  // 스티커 그림 만들기: 오린 모양 → 색감 → 흰 테두리 → 여백 없이 잘라내기
  function make(maxEdge) {
    const W = s.src.width, H = s.src.height, tone = TONES.find(t => t.id === s.tone) || TONES[0];
    const shape = document.createElement('canvas'); shape.width = W; shape.height = H;
    const x = shape.getContext('2d'); x.filter = tone.f;
    if (s.mode === 'person' && s.cut) x.drawImage(s.cut, 0, 0);
    else {
      const o = s.oval, m = Math.max(W, H);
      x.save(); x.beginPath(); x.ellipse(o.cx * W, o.cy * H, o.rx * W * o.k, o.ry * H * o.k, 0, 0, 7); x.clip(); x.drawImage(s.src, 0, 0); x.restore();
      void m;
    }
    x.filter = 'none';
    // 보이는 부분의 테두리 상자
    const d = x.getImageData(0, 0, W, H).data; let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let yy = 0; yy < H; yy += 2) for (let xx = 0; xx < W; xx += 2) if (d[(yy * W + xx) * 4 + 3] > 24) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
    if (x1 < 0) { shape.width = shape.height = 1; return null; }
    const bw = [0, .012, .026][s.border] * Math.max(x1 - x0, y1 - y0), pad = Math.ceil(bw * 1.4 + 4);
    const cw = x1 - x0 + 1 + pad * 2, ch = y1 - y0 + 1 + pad * 2, k = Math.min(1, maxEdge / Math.max(cw, ch));
    const out = document.createElement('canvas'); out.width = Math.max(1, Math.round(cw * k)); out.height = Math.max(1, Math.round(ch * k));
    const o = out.getContext('2d'); o.scale(k, k); o.translate(pad - x0, pad - y0);
    if (bw > 0) {
      // 흰 실루엣을 둥글게 여러 방향으로 찍어 테두리를 만든다
      const sil = document.createElement('canvas'); sil.width = W; sil.height = H;
      const sx = sil.getContext('2d'); sx.drawImage(shape, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = '#ffffff'; sx.fillRect(0, 0, W, H);
      o.shadowColor = 'rgba(0,0,0,.18)'; o.shadowBlur = bw * .8 * k;
      for (let a = 0; a < 24; a++) o.drawImage(sil, Math.cos(a / 24 * Math.PI * 2) * bw, Math.sin(a / 24 * Math.PI * 2) * bw);
      o.shadowColor = 'transparent'; o.drawImage(sil, 0, 0); sil.width = sil.height = 1;
    }
    o.drawImage(shape, 0, 0);
    shape.width = shape.height = 1;
    return out;
  }

  function render() {
    if (!s) return;
    sync();
    const sc = $('smSource'), x = sc.getContext('2d');
    x.drawImage(s.src, 0, 0);
    if (s.mode === 'face') {
      const o = s.oval, W = sc.width, H = sc.height;
      x.save(); x.fillStyle = 'rgba(0,0,0,.45)'; x.beginPath(); x.rect(0, 0, W, H); x.ellipse(o.cx * W, o.cy * H, o.rx * W * o.k, o.ry * H * o.k, 0, 0, 7); x.fill('evenodd');
      x.setLineDash([W / 60, W / 90]); x.lineWidth = Math.max(2, W / 200); x.strokeStyle = '#c8f04a'; x.beginPath(); x.ellipse(o.cx * W, o.cy * H, o.rx * W * o.k, o.ry * H * o.k, 0, 0, 7); x.stroke(); x.restore();
    }
    const out = $('smOut'), m = make(700);
    if (!m) { out.width = out.height = 1; return; }
    out.width = m.width; out.height = m.height; out.getContext('2d').drawImage(m, 0, 0); m.width = m.height = 1;
  }

  async function finish(keep) {
    if (!s) return;
    const m = make(900); if (!m) { toast('오린 부분이 없어요. 다시 맞춰주세요.', true); return; }
    const blob = await new Promise(r => m.toBlob(r, 'image/png')); m.width = m.height = 1;
    if (!blob) { toast('스티커를 만들지 못했어요. 다시 시도해주세요.', true); return; }
    if (keep) {
      try { await PhotoSokMyStickers.add(blob); } catch (e) { toast(errText(e, '이 기기에는 스티커를 보관할 수 없어요. PNG로 저장해주세요.'), true); return; }
      const item = s.item; dialog.close();
      toast('내 스티커에 넣었어요. 꾸미기 → 스티커 → 내 스티커에서 붙일 수 있어요.');
      if (window.PhotoSokDeco) { await PhotoSokDeco.open(item); document.querySelector('#decoDialog [data-dtab="sticker"]')?.click(); document.querySelector('#decoDialog [data-pack="mine"]')?.click(); }
      return;
    }
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const name = `사진집사_스티커_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
    const r = await FileDelivery.save(blob, name);
    if (r.status === 'saved') toast(r.message || '투명 배경 스티커를 저장했어요.');
    else if (r.status === 'failed') toast(r.message || '저장하지 못했어요. 다시 시도해주세요.', true);
  }

  function start() {
    const first = state.items.find(i => i.sourceType !== 'pdf');
    if (first) { open(first); return; }
    pending = true; $('choose').click();
  }
  function afterAdd(newItems) { if (!pending) return; pending = false; if (newItems && newItems.length) open(newItems[0]); }
  window.PhotoSokStickerMaker = Object.freeze({ open, start, afterAdd });
})();
