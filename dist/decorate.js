'use strict';
// 인스타 꾸미기: 필터 프리셋(강도 조절) + 인스타 비율(잘라 채우기 / 여백·흐린 배경) 을 한 화면에서.
// 원래 사진은 item.decoBase 에 남겨 다시 열면 처음부터 고친다. 글씨가 있으면 꾸민 사진 위에 다시 얹는다.
(() => {
  const $ = id => document.getElementById(id);
  // 모든 값은 강도 100% 기준. exp:노출(스톱) con:대비 sat:채도 warm:색온도 tint:초록↔자홍 fade:검정 들뜸
  // sh/hi: 어두운 곳/밝은 곳 색 더하기 [r,g,b] vig:가장자리 어둡게 grain:입자 bw:흑백 sepia:갈색
  const FILTERS = [
    { id: 'none', name: '원본', group: '기본', p: {} },
    { id: 'vivid', name: '선명하게', group: '기본', p: { con: .18, sat: .28, exp: .05 } },
    { id: 'warm', name: '따뜻하게', group: '기본', p: { warm: .6, sat: .08, exp: .04 } },
    { id: 'cool', name: '차갑게', group: '기본', p: { warm: -.55, sat: -.04 } },
    { id: 'soft', name: '부드럽게', group: '기본', p: { con: -.18, fade: .25, exp: .08, sat: -.08 } },
    { id: 'clear', name: '청량', group: '감성', p: { exp: .18, con: -.15, sat: -.1, fade: .3, sh: [-.01, .03, .03], hi: [-.02, .02, .04], warm: -.2 } },
    { id: 'mint', name: '민트 그늘', group: '감성', p: { exp: .12, con: -.12, sat: -.15, fade: .35, sh: [-.02, .05, .02], tint: .15 } },
    { id: 'cream', name: '크림 화이트', group: '감성', p: { exp: .2, con: -.2, sat: -.3, fade: .3, hi: [.03, .02, -.01], warm: .25 } },
    { id: 'pink', name: '봄날 핑크', group: '감성', p: { exp: .12, con: -.08, sat: -.05, hi: [.04, 0, .02], tint: -.25, fade: .15 } },
    { id: 'cafe', name: '카페', group: '일상', p: { warm: .45, con: .05, sat: -.12, fade: .2, sh: [.02, .01, -.02], vig: .25 } },
    { id: 'food', name: '맛있게', group: '일상', p: { warm: .3, sat: .3, con: .12, exp: .06 } },
    { id: 'golden', name: '노을빛', group: '풍경', p: { warm: .85, sat: .12, hi: [.04, .015, -.03], vig: .2 } },
    { id: 'sky', name: '푸른 하늘', group: '풍경', p: { warm: -.25, sat: .22, con: .1, hi: [-.01, .01, .04] } },
    { id: 'film', name: '필름', group: '필름', p: { con: .08, sat: -.12, fade: .3, sh: [0, .02, .03], hi: [.03, .015, -.02], grain: .5 } },
    { id: 'faded', name: '바랜 필름', group: '필름', p: { con: -.15, sat: -.32, fade: .5, warm: .3, grain: .4, vig: .2 } },
    { id: 'retro', name: '90년대', group: '필름', p: { con: .12, sat: .1, warm: .35, tint: -.1, fade: .2, grain: .6, vig: .25 } },
    { id: 'teal', name: '틸 & 오렌지', group: '시네마', p: { con: .15, sh: [-.03, .02, .05], hi: [.05, .02, -.04], sat: .05, vig: .3 } },
    { id: 'night', name: '밤거리', group: '시네마', p: { con: .2, exp: -.05, sh: [.0, -.01, .05], hi: [.04, -.01, .03], sat: .15, vig: .35 } },
    { id: 'bw', name: '흑백', group: '흑백', p: { bw: 1, con: .1 } },
    { id: 'bwhard', name: '진한 흑백', group: '흑백', p: { bw: 1, con: .4, exp: -.05, vig: .3 } },
    { id: 'bwsoft', name: '부드러운 흑백', group: '흑백', p: { bw: 1, con: -.15, fade: .3 } },
    { id: 'sepia', name: '세피아', group: '흑백', p: { sepia: 1, con: .05, fade: .15, vig: .2 } },
  ];
  const RATIOS = [
    { id: 'orig', name: '원본 비율' },
    { id: '1:1', name: '정사각 1:1', w: 1080, h: 1080 },
    { id: '4:5', name: '세로 4:5', w: 1080, h: 1350 },
    { id: '9:16', name: '스토리 9:16', w: 1080, h: 1920 },
    { id: '1.91:1', name: '가로 1.91:1', w: 1080, h: 566 },
  ];
  const FITS = [{ id: 'cover', name: '꽉 채우기' }, { id: 'white', name: '흰 여백' }, { id: 'black', name: '검정 여백' }, { id: 'blur', name: '흐린 배경' }];
  const DEFAULT = { filter: 'none', strength: 100, ratio: 'orig', fit: 'cover', crop: { x: .5, y: .5, zoom: 1 } };
  let dialog, canvas, session = null, pending = false;

  function params(id, strength) {
    const f = FILTERS.find(x => x.id === id) || FILTERS[0];
    const s = strength / 100, p = f.p, v = k => (p[k] || 0) * s;
    const tint = a => (a || [0, 0, 0]).map(n => n * s);
    return { exp: v('exp'), con: v('con'), sat: v('sat'), warm: v('warm'), tint: v('tint'), fade: v('fade'), vig: v('vig'), grain: v('grain'),
      bw: Math.min(1, v('bw')), sepia: Math.min(1, v('sepia')), sh: tint(p.sh), hi: tint(p.hi) };
  }

  // 픽셀 단위 색 보정 (미리보기와 저장 결과가 같은 식을 쓴다)
  function grade(ctx, w, h, q) {
    if (!['exp', 'con', 'sat', 'warm', 'tint', 'fade', 'vig', 'grain', 'bw', 'sepia'].some(k => q[k]) && !q.sh.some(Boolean) && !q.hi.some(Boolean)) return;
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    const gain = Math.pow(2, q.exp), lift = q.fade * 0.12;
    const cx = w / 2, cy = h / 2, rr = cx * cx + cy * cy;
    let seed = 12345;
    for (let y = 0, i = 0; y < h; y++) {
      const dy = (y - cy) * (y - cy);
      for (let x = 0; x < w; x++, i += 4) {
        let r = d[i] / 255 * gain, g = d[i + 1] / 255 * gain, b = d[i + 2] / 255 * gain;
        r += q.warm * .08; b -= q.warm * .08; g += q.tint * .05; r -= q.tint * .015; b -= q.tint * .015;
        r = (r - .5) * (1 + q.con) + .5; g = (g - .5) * (1 + q.con) + .5; b = (b - .5) * (1 + q.con) + .5;
        let L = .299 * r + .587 * g + .114 * b;
        const sat = 1 + q.sat - q.bw - q.sepia;
        r = L + (r - L) * sat; g = L + (g - L) * sat; b = L + (b - L) * sat;
        if (q.sepia) { const t = q.sepia; r += (L * 1.07 - r) * t + .06 * t * (1 - L); g += (L * .87 - g) * t; b += (L * .62 - b) * t; }
        const Lc = Math.min(1, Math.max(0, L)), ws = (1 - Lc) * (1 - Lc), wh = Lc * Lc;
        r += q.sh[0] * ws + q.hi[0] * wh; g += q.sh[1] * ws + q.hi[1] * wh; b += q.sh[2] * ws + q.hi[2] * wh;
        if (lift) { r = r * (1 - lift) + lift; g = g * (1 - lift) + lift; b = b * (1 - lift) + lift; }
        if (q.vig) { const k = 1 - q.vig * .55 * Math.pow(((x - cx) * (x - cx) + dy) / rr, 1.3); r *= k; g *= k; b *= k; }
        if (q.grain) { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; const n = ((seed >>> 24) / 255 - .5) * q.grain * .09; r += n; g += n; b += n; }
        d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // 비율 + 필터를 적용해 w×h 캔버스에 그린다. src 는 회전까지 반영된 캔버스.
  function compose(out, src, spec) {
    const ctx = out.getContext('2d'), w = out.width, h = out.height;
    ctx.imageSmoothingQuality = 'high';
    const fit = spec.ratio === 'orig' ? 'cover' : spec.fit;
    if (fit === 'cover') {
      const l = PhotoEngine.coverLayout(src.width, src.height, w, h, spec.ratio === 'orig' ? null : spec.crop);
      ctx.drawImage(src, w / 2 + l.dx - src.width * l.scale / 2, h / 2 + l.dy - src.height * l.scale / 2, src.width * l.scale, src.height * l.scale);
    } else {
      if (fit === 'blur') {
        const l = PhotoEngine.coverLayout(src.width, src.height, w, h, null);
        ctx.save(); ctx.filter = `blur(${Math.round(Math.max(w, h) / 40)}px) brightness(.85)`;
        ctx.drawImage(src, w / 2 - src.width * l.scale * .55, h / 2 - src.height * l.scale * .55, src.width * l.scale * 1.1, src.height * l.scale * 1.1);
        ctx.restore();
      } else { ctx.fillStyle = fit === 'black' ? '#000' : '#fff'; ctx.fillRect(0, 0, w, h); }
      const s = Math.min(w / src.width, h / src.height);
      ctx.drawImage(src, (w - src.width * s) / 2, (h - src.height * s) / 2, src.width * s, src.height * s);
    }
    grade(ctx, w, h, params(spec.filter, spec.strength));
  }
  function frameSize(spec, src, maxEdge) {
    const r = RATIOS.find(x => x.id === spec.ratio);
    let w = r?.w || src.width, h = r?.h || src.height;
    const s = Math.min(1, maxEdge / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
  }
  async function oriented(file, rotation, maxEdge) {
    const src = await PhotoEngine.decode(file);
    try {
      const q = rotation === 90 || rotation === 270;
      const ow = q ? src.height : src.width, oh = q ? src.width : src.height;
      const s = Math.min(1, maxEdge / Math.max(ow, oh));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(ow * s)); c.height = Math.max(1, Math.round(oh * s));
      const x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2); x.rotate(rotation * Math.PI / 180);
      const dw = q ? c.height : c.width, dh = q ? c.width : c.height;
      x.drawImage(src.image, -dw / 2, -dh / 2, dw, dh);
      return c;
    } finally { src.close(); }
  }

  function build() {
    dialog = document.createElement('dialog');
    dialog.id = 'decoDialog';
    dialog.innerHTML = `
      <div class="dialog-head"><h2>인스타 꾸미기</h2><button type="button" class="icon-button" id="decoClose" aria-label="꾸미기 닫기"><svg><use href="#i-close"/></svg></button></div>
      <div class="text-stage"><canvas id="decoCanvas" aria-label="꾸미기 미리보기"></canvas></div>
      <p class="text-hint" id="decoHint"></p>
      <p class="deco-label">필터</p>
      <div class="deco-filters" id="decoFilters" role="group" aria-label="필터"></div>
      <label class="crop-zoom"><span>강도</span><input type="range" id="decoStrength" min="0" max="150" step="5" aria-label="필터 강도"><b id="decoStrengthValue"></b></label>
      <p class="deco-label">비율</p>
      <div class="text-row wrap" id="decoRatios" role="group" aria-label="인스타 비율">${RATIOS.map(r => `<button type="button" data-ratio="${r.id}">${r.name}</button>`).join('')}</div>
      <div class="text-row wrap" id="decoFits" role="group" aria-label="비율이 다를 때">${FITS.map(f => `<button type="button" data-fit="${f.id}">${f.name}</button>`).join('')}</div>
      <label class="crop-zoom" id="decoZoomRow"><span>확대</span><input type="range" id="decoZoom" min="100" max="400" step="1" aria-label="확대"></label>
      <div class="crop-actions"><button type="button" class="small-button" id="decoApply">적용만</button><button type="button" class="primary" id="decoSave">꾸며서 저장</button></div>`;
    document.body.append(dialog);
    canvas = $('decoCanvas');
    $('decoClose').onclick = () => dialog.close();
    dialog.addEventListener('close', () => { session = null; });
    $('decoStrength').oninput = () => { session.spec.strength = Number($('decoStrength').value); sync(); schedule(); };
    $('decoZoom').oninput = () => { session.spec.crop.zoom = $('decoZoom').value / 100; schedule(); };
    dialog.querySelectorAll('[data-ratio]').forEach(b => b.onclick = () => { session.spec.ratio = b.dataset.ratio; session.spec.crop = { x: .5, y: .5, zoom: 1 }; resize(); sync(); schedule(); });
    dialog.querySelectorAll('[data-fit]').forEach(b => b.onclick = () => { session.spec.fit = b.dataset.fit; sync(); schedule(); });
    $('decoApply').onclick = () => finish(false);
    $('decoSave').onclick = () => finish(true);
    let last = null;
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); last = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointermove', e => {
      if (!last || !session || !movable()) return;
      const ratio = canvas.width / canvas.getBoundingClientRect().width, s = session, c = s.spec.crop;
      const l = PhotoEngine.coverLayout(s.preview.width, s.preview.height, canvas.width, canvas.height, c);
      if (l.overflowX > 0) c.x = Math.min(1, Math.max(0, c.x - (e.clientX - last.x) * ratio / l.overflowX));
      if (l.overflowY > 0) c.y = Math.min(1, Math.max(0, c.y - (e.clientY - last.y) * ratio / l.overflowY));
      last = { x: e.clientX, y: e.clientY }; schedule();
    });
    const end = () => { last = null; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  }
  const movable = () => session && session.spec.ratio !== 'orig' && session.spec.fit === 'cover';
  let raf = 0;
  function schedule() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; draw(); }); }
  function resize() { const f = frameSize(session.spec, session.preview, 640); canvas.width = f.w; canvas.height = f.h; }
  function draw() { if (session) compose(canvas, session.preview, session.spec); }
  function sync() {
    const s = session.spec;
    dialog.querySelectorAll('[data-filter]').forEach(b => { const on = b.dataset.filter === s.filter; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    dialog.querySelectorAll('[data-ratio]').forEach(b => { const on = b.dataset.ratio === s.ratio; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    dialog.querySelectorAll('[data-fit]').forEach(b => { const on = b.dataset.fit === s.fit; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    $('decoFits').hidden = s.ratio === 'orig';
    $('decoZoomRow').hidden = !movable();
    $('decoStrength').value = s.strength; $('decoStrengthValue').textContent = s.strength + '%';
    $('decoZoom').value = Math.round(s.crop.zoom * 100);
    $('decoHint').textContent = movable() ? '사진을 끌어서 보일 부분을 고를 수 있어요.' : s.ratio === 'orig' ? '인스타용 비율을 고르면 1080px 너비로 맞춰요.' : '사진 전체가 보이도록 여백을 넣어요.';
  }
  function thumbs() {
    const box = $('decoFilters'); box.replaceChildren();
    const t = document.createElement('canvas'); const s = 72 / Math.max(session.preview.width, session.preview.height);
    t.width = Math.max(1, Math.round(session.preview.width * s)); t.height = Math.max(1, Math.round(session.preview.height * s));
    for (const f of FILTERS) {
      compose(t, session.preview, { ...DEFAULT, filter: f.id, strength: 100 });
      const b = document.createElement('button'); b.type = 'button'; b.dataset.filter = f.id;
      const img = document.createElement('img'); img.alt = ''; img.src = t.toDataURL('image/jpeg', .8);
      const span = document.createElement('span'); span.textContent = f.name;
      b.append(img, span);
      b.onclick = () => { session.spec.filter = f.id; if (!session.spec.strength) session.spec.strength = 100; sync(); schedule(); };
      box.append(b);
    }
  }

  function baseOf(item) {
    if (item.decoBase) return item.decoBase;
    if (item.textBase) return item.textBase; // 글씨 넣기 전 사진 위에서 꾸민다
    return null;
  }
  async function open(item) {
    if (!item || state.busy) return;
    if (!dialog) build();
    let base = baseOf(item);
    try {
      if (!base) { const input = await itemInputFile(item); base = { file: input, rotation: item.sourceType === 'pdf' ? 0 : (item.rotation || 0) }; }
      const preview = await oriented(base.file, base.rotation, 640);
      session = { item, base, preview, spec: JSON.parse(JSON.stringify({ ...DEFAULT, ...(item.decoSpec || {}) })) };
    } catch (e) { toast('사진을 열지 못했어요. 다시 시도해주세요.', true); return; }
    resize(); thumbs(); sync(); draw();
    dialog.showModal();
  }

  async function finish(save) {
    if (!session) return;
    const { item, base, spec } = session;
    $('decoApply').disabled = $('decoSave').disabled = true;
    try {
      const src = await oriented(base.file, base.rotation, 4096);
      const f = frameSize(spec, src, spec.ratio === 'orig' ? 4096 : 1920);
      const out = document.createElement('canvas'); out.width = f.w; out.height = f.h;
      compose(out, src, spec);
      src.width = src.height = 1;
      const decoBlob = await new Promise(res => out.toBlob(res, 'image/jpeg', 0.95));
      if (!decoBlob) throw new Error();
      const stem = (item.originalFile?.name || item.file.name || '사진').replace(/\.[^.]+$/, '').replace(/_(글씨|꾸미기)$/, '');
      let finalBlob = decoBlob;
      if (item.textSpec && window.PhotoSokText) {
        // 글씨가 있던 사진이면 꾸민 사진 위에 같은 글씨를 다시 얹는다.
        try { await document.fonts.load('700 40px Pretendard', item.textSpec.text); } catch (_) {}
        const copy = document.createElement('canvas'); copy.width = out.width; copy.height = out.height;
        copy.getContext('2d').drawImage(out, 0, 0);
        PhotoSokText.paint(out.getContext('2d'), copy, out.width, out.height, item.textSpec);
        copy.width = copy.height = 1;
        finalBlob = await new Promise(res => out.toBlob(res, 'image/jpeg', 0.95));
        item.textBase = { file: new File([decoBlob], stem + '_꾸미기.jpg', { type: 'image/jpeg' }), rotation: 0 };
      }
      const width = out.width, height = out.height; out.width = out.height = 1;
      if (!item.editBackup) item.editBackup = { file: item.file, sourceType: item.sourceType, pageIndex: item.pageIndex, width: item.width, height: item.height, rotation: item.rotation, url: item.url };
      else if (item.url !== item.editBackup.url) URL.revokeObjectURL(item.url);
      item.decoBase = base; item.decoSpec = JSON.parse(JSON.stringify(spec));
      const name = stem + '_꾸미기.jpg';
      item.file = new File([finalBlob], name, { type: 'image/jpeg' });
      item.sourceType = 'photo'; delete item.pageIndex;
      item.url = URL.createObjectURL(item.file); item.width = width; item.height = height; item.rotation = 0;
      touchItem(item);
      dialog.close();
      render();
      if (save) {
        const r = await FileDelivery.save(finalBlob, name);
        if (r.status === 'saved') toast(r.message || '꾸민 사진을 저장했어요.');
        else if (r.status === 'failed') toast(r.message || '저장하지 못했어요. 다시 시도해주세요.', true);
      } else toast('꾸미기를 적용했어요. 글씨를 넣거나 용량을 줄일 수 있어요.');
    } catch (e) { toast('꾸미기를 적용하지 못했어요. 다시 시도해주세요.', true); }
    finally { $('decoApply').disabled = $('decoSave').disabled = false; }
  }

  function start() {
    const first = state.items.find(i => i.sourceType !== 'pdf') || state.items[0];
    if (first) { open(first); return; }
    pending = true; $('choose').click();
  }
  function afterAdd(newItems) { if (!pending) return; pending = false; if (newItems && newItems.length) open(newItems[0]); }
  window.PhotoSokDeco = Object.freeze({ open, start, afterAdd, compose, FILTERS, RATIOS });
})();
