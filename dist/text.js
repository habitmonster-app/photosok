'use strict';
// 사진에 글씨 넣기: 띠·그림자·상자 스타일로 글씨를 얹고, 사진을 새 파일로 바꾼다.
// 원래 사진은 item.textBase 에 남겨 두어 다시 열면 글씨를 처음부터 고칠 수 있다.
(() => {
  const $ = id => document.getElementById(id);
  const FONT = '"Pretendard", Pretendard, -apple-system, "Noto Sans KR", sans-serif';
  const COLORS = { white: '#ffffff', black: '#111111', lime: '#c8f04a', yellow: '#ffd43b' };
  const DEFAULT = { text: '', style: 'band', color: 'white', size: 6, x: 0.5, y: 0.5 };
  let dialog, canvas, session = null, pending = false;

  // 모든 크기는 사진 가로 길이에 대한 비율이라 미리보기와 저장 결과가 같다.
  function paint(ctx, image, w, h, spec) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, w, h);
    const text = String(spec.text || '').replace(/\r/g, '');
    if (!text.trim()) return;
    const lines = text.split('\n').slice(0, 6);
    const px = Math.max(8, Math.round(Math.min(w, h * 1.2) * spec.size / 100));
    const lineH = px * 1.32;
    const pad = px * 0.55;
    ctx.font = `700 ${px}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const color = COLORS[spec.color] || COLORS.white;
    const dark = spec.color === 'black';
    const blockH = lines.length * lineH;
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
    const cx = spec.style === 'band' ? w / 2 : clamp(spec.x * w, widest / 2 + pad, w - widest / 2 - pad);
    const cy = clamp(spec.y * h, blockH / 2 + pad, h - blockH / 2 - pad);
    ctx.save();
    if (spec.style === 'band') {
      ctx.fillStyle = dark ? 'rgba(255,255,255,.72)' : 'rgba(0,0,0,.55)';
      ctx.fillRect(0, cy - blockH / 2 - pad, w, blockH + pad * 2);
    } else if (spec.style === 'box') {
      const bw = widest + pad * 2.4, bh = blockH + pad * 1.6, r = px * 0.35;
      ctx.fillStyle = dark ? 'rgba(255,255,255,.92)' : 'rgba(0,0,0,.78)';
      roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, r); ctx.fill();
    } else {
      ctx.shadowColor = dark ? 'rgba(255,255,255,.85)' : 'rgba(0,0,0,.7)';
      ctx.shadowBlur = px * 0.3;
      ctx.shadowOffsetY = px * 0.04;
    }
    ctx.fillStyle = color;
    lines.forEach((l, i) => ctx.fillText(l, cx, cy - blockH / 2 + lineH * (i + 0.5)));
    ctx.restore();
  }
  function clamp(v, lo, hi) { return hi < lo ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)); }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // 회전까지 반영한 원본 그림 (저장용은 긴 변 4096px까지)
  async function oriented(file, rotation, maxEdge) {
    const src = await PhotoEngine.decode(file);
    try {
      const q = rotation === 90 || rotation === 270;
      const ow = q ? src.height : src.width, oh = q ? src.width : src.height;
      const s = Math.min(1, maxEdge / Math.max(ow, oh));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(ow * s)); c.height = Math.max(1, Math.round(oh * s));
      const x = c.getContext('2d');
      x.translate(c.width / 2, c.height / 2); x.rotate(rotation * Math.PI / 180);
      const dw = (q ? c.height : c.width), dh = (q ? c.width : c.height);
      x.drawImage(src.image, -dw / 2, -dh / 2, dw, dh);
      return c;
    } finally { src.close(); }
  }

  function build() {
    dialog = document.createElement('dialog');
    dialog.id = 'textDialog';
    dialog.innerHTML = `
      <div class="dialog-head"><h2>글씨 넣기</h2><button type="button" class="icon-button" id="textClose" aria-label="글씨 넣기 닫기"><svg><use href="#i-close"/></svg></button></div>
      <div class="text-stage"><canvas id="textCanvas" aria-label="글씨 미리보기"></canvas></div>
      <p class="text-hint">글씨를 끌어서 위치를 옮길 수 있어요.</p>
      <textarea id="textInput" rows="2" maxlength="120" placeholder="사진에 넣을 글씨"></textarea>
      <div class="text-row" role="group" aria-label="모양"><button type="button" data-tstyle="band">띠</button><button type="button" data-tstyle="shadow">그림자</button><button type="button" data-tstyle="box">상자</button></div>
      <div class="text-row colors" role="group" aria-label="글씨 색">${Object.entries(COLORS).map(([k, v]) => `<button type="button" data-tcolor="${k}" aria-label="${{ white: '흰색', black: '검정', lime: '라임', yellow: '노랑' }[k]}" style="--sw:${v}"></button>`).join('')}</div>
      <label class="crop-zoom"><span>크기</span><input type="range" id="textSize" min="3" max="14" step="0.5" aria-label="글씨 크기"></label>
      <div class="crop-actions"><button type="button" class="small-button" id="textApply">적용만</button><button type="button" class="primary" id="textSave">글씨 넣어 저장</button></div>`;
    document.body.append(dialog);
    canvas = $('textCanvas');
    $('textClose').onclick = () => dialog.close();
    dialog.addEventListener('close', () => { session = null; });
    $('textInput').oninput = () => { session.spec.text = $('textInput').value; draw(); };
    $('textSize').oninput = () => { session.spec.size = Number($('textSize').value); draw(); };
    dialog.querySelectorAll('[data-tstyle]').forEach(b => b.onclick = () => { session.spec.style = b.dataset.tstyle; sync(); draw(); });
    dialog.querySelectorAll('[data-tcolor]').forEach(b => b.onclick = () => { session.spec.color = b.dataset.tcolor; sync(); draw(); });
    $('textApply').onclick = () => finish(false);
    $('textSave').onclick = () => finish(true);
    let last = null;
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); last = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointermove', e => {
      if (!last || !session) return;
      const r = canvas.getBoundingClientRect();
      session.spec.x = Math.min(1, Math.max(0, session.spec.x + (e.clientX - last.x) / r.width));
      session.spec.y = Math.min(1, Math.max(0, session.spec.y + (e.clientY - last.y) / r.height));
      last = { x: e.clientX, y: e.clientY }; draw();
    });
    const end = () => { last = null; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  }
  function sync() {
    const s = session.spec;
    dialog.querySelectorAll('[data-tstyle]').forEach(b => { const on = b.dataset.tstyle === s.style; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    dialog.querySelectorAll('[data-tcolor]').forEach(b => { const on = b.dataset.tcolor === s.color; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }
  function draw() { if (session) paint(canvas.getContext('2d'), session.preview, canvas.width, canvas.height, session.spec); }

  async function open(item) {
    if (!item || state.busy) return;
    if (!dialog) build();
    let base = item.textBase;
    try {
      if (!base) { const input = await itemInputFile(item); base = { file: input, rotation: item.sourceType === 'pdf' ? 0 : (item.rotation || 0) }; }
      const preview = await oriented(base.file, base.rotation, 900);
      canvas.width = preview.width; canvas.height = preview.height;
      session = { item, base, preview, spec: { ...DEFAULT, ...(item.textSpec || {}) } };
    } catch (e) { toast('사진을 열지 못했어요. 다시 시도해주세요.', true); return; }
    $('textInput').value = session.spec.text;
    $('textSize').value = session.spec.size;
    sync();
    try { await document.fonts.load(`700 40px Pretendard`, '가나다abc'); } catch (_) {}
    draw();
    dialog.showModal();
    $('textInput').focus();
  }

  async function finish(save) {
    if (!session) return;
    const { item, base, spec } = session;
    if (!spec.text.trim()) { toast('넣을 글씨를 입력해주세요.', true); $('textInput').focus(); return; }
    $('textApply').disabled = $('textSave').disabled = true;
    try {
      try { await document.fonts.load(`700 40px Pretendard`, spec.text); } catch (_) {}
      const full = await oriented(base.file, base.rotation, 4096);
      const out = document.createElement('canvas'); out.width = full.width; out.height = full.height;
      paint(out.getContext('2d'), full, out.width, out.height, spec);
      full.width = full.height = 1;
      const blob = await new Promise(res => out.toBlob(res, 'image/jpeg', 0.95));
      const width = out.width, height = out.height; out.width = out.height = 1;
      if (!blob) throw new Error();
      const stem = (item.originalFile?.name || item.file.name || '사진').replace(/\.[^.]+$/, '').replace(/_(글씨|꾸미기)$/, '');
      if (!item.editBackup) item.editBackup = { file: item.file, sourceType: item.sourceType, pageIndex: item.pageIndex, width: item.width, height: item.height, rotation: item.rotation, url: item.url };
      else if (item.url !== item.editBackup.url) URL.revokeObjectURL(item.url);
      item.textBase = base; item.textSpec = { ...spec };
      item.file = new File([blob], stem + '_글씨.jpg', { type: 'image/jpeg' });
      item.sourceType = 'photo'; delete item.pageIndex;
      item.url = URL.createObjectURL(item.file); item.width = width; item.height = height; item.rotation = 0;
      touchItem(item);
      dialog.close();
      render();
      if (save) {
        const r = await FileDelivery.save(blob, stem + '_글씨.jpg');
        if (r.status === 'saved') toast(r.message || '글씨를 넣어 저장했어요.');
        else if (r.status === 'failed') toast(r.message || '저장하지 못했어요. 다시 시도해주세요.', true);
      } else toast('글씨를 넣었어요. 용량을 줄이거나 저장할 수 있어요.');
    } catch (e) { toast('글씨를 넣지 못했어요. 다시 시도해주세요.', true); }
    finally { $('textApply').disabled = $('textSave').disabled = false; }
  }

  // 홈 타일에서 사진 없이 시작하면, 사진을 고른 뒤 바로 편집 화면을 연다.
  function start() {
    const first = state.items.find(i => i.sourceType !== 'pdf') || state.items[0];
    if (first) { open(first); return; }
    pending = true;
    $('choose').click();
  }
  function afterAdd(newItems) {
    if (!pending) return;
    pending = false;
    if (newItems && newItems.length) open(newItems[0]);
  }
  window.PhotoSokText = Object.freeze({ open, start, afterAdd, paint });
})();
