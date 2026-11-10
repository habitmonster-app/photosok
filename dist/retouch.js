'use strict';
// 손으로 고치기: 잡티 지우기(문지른 곳을 주변 피부색으로 메움)와 부분 보정(칠한 곳만 밝기·채도·색온도).
// 붓질은 사진 크기에 대한 비율로 기록해 두었다가, 저장할 때 원본 크기에서 같은 순서로 다시 적용한다. 모두 기기 안에서 계산한다.
(() => {
  const $ = id => document.getElementById(id);
  let dialog = null, s = null, pending = false;

  // ---- 잡티 지우기: 칠한 칸을 바깥쪽부터 이웃 평균으로 채운다(양파 껍질 방식) ----
  function heal(ctx, w, h, stroke) {
    const m = Math.min(w, h), r = Math.max(1.5, stroke.r * m);
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (const [px, py] of stroke.pts) { x0 = Math.min(x0, px * w); y0 = Math.min(y0, py * h); x1 = Math.max(x1, px * w); y1 = Math.max(y1, py * h); }
    const pad = Math.ceil(r * 2 + 3);
    x0 = Math.max(0, Math.floor(x0 - pad)); y0 = Math.max(0, Math.floor(y0 - pad)); x1 = Math.min(w, Math.ceil(x1 + pad)); y1 = Math.min(h, Math.ceil(y1 + pad));
    const bw = x1 - x0, bh = y1 - y0; if (bw < 3 || bh < 3) return;
    // 큰 붓은 줄인 그림에서 메운 뒤 다시 키운다 (빠르고, 메운 결도 부드럽다)
    const f = Math.min(1, 9 / r), sw = Math.max(3, Math.round(bw * f)), sh = Math.max(3, Math.round(bh * f)), fx = sw / bw, fy = sh / bh;
    const drawMask = (mx, W, H, kx, ky, rr) => {
      mx.lineCap = mx.lineJoin = 'round'; mx.lineWidth = rr * 2; mx.strokeStyle = mx.fillStyle = '#000';
      mx.beginPath(); stroke.pts.forEach(([px, py], i) => { const X = (px * w - x0) * kx, Y = (py * h - y0) * ky; i ? mx.lineTo(X, Y) : mx.moveTo(X, Y); });
      if (stroke.pts.length === 1) { mx.arc((stroke.pts[0][0] * w - x0) * kx, (stroke.pts[0][1] * h - y0) * ky, rr, 0, 7); mx.fill(); } else mx.stroke();
    };
    const small = document.createElement('canvas'); small.width = sw; small.height = sh;
    const sx = small.getContext('2d', { willReadFrequently: true }); sx.drawImage(ctx.canvas, x0, y0, bw, bh, 0, 0, sw, sh);
    const mc = document.createElement('canvas'); mc.width = sw; mc.height = sh; const mxx = mc.getContext('2d');
    drawMask(mxx, sw, sh, fx, fy, r * f + .8);
    const md = mxx.getImageData(0, 0, sw, sh).data; mc.width = mc.height = 1;
    const img = sx.getImageData(0, 0, sw, sh), d = img.data, n = sw * sh;
    const hole = new Uint8Array(n); let list = [];
    for (let i = 0; i < n; i++) if (md[i * 4 + 3] > 20) { hole[i] = 1; list.push(i); }
    const rgb = new Float32Array(n * 3); for (let i = 0; i < n; i++) { rgb[i * 3] = d[i * 4]; rgb[i * 3 + 1] = d[i * 4 + 1]; rgb[i * 3 + 2] = d[i * 4 + 2]; }
    let guard = 0;
    while (list.length && guard++ < 400) {
      const done = [], rest = [];
      for (const i of list) {
        const x = i % sw, y = (i / sw) | 0; let R = 0, G = 0, B = 0, c = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= sw || yy >= sh) continue;
          const j = yy * sw + xx; if (hole[j]) continue;
          const wt = dx * dx + dy * dy <= 2 ? 2 : 1; R += rgb[j * 3] * wt; G += rgb[j * 3 + 1] * wt; B += rgb[j * 3 + 2] * wt; c += wt;
        }
        if (c >= 3) done.push(i, R / c, G / c, B / c); else rest.push(i);
      }
      if (!done.length) break;
      for (let k = 0; k < done.length; k += 4) { const i = done[k]; rgb[i * 3] = done[k + 1]; rgb[i * 3 + 1] = done[k + 2]; rgb[i * 3 + 2] = done[k + 3]; hole[i] = 0; }
      list = rest;
    }
    for (let i = 0; i < n; i++) { d[i * 4] = rgb[i * 3]; d[i * 4 + 1] = rgb[i * 3 + 1]; d[i * 4 + 2] = rgb[i * 3 + 2]; d[i * 4 + 3] = 255; }
    sx.putImageData(img, 0, 0);
    // 원래 크기로 키워서 붓 자국 모양(가장자리 부드럽게)으로만 덮는다 + 아주 약한 결
    const big = document.createElement('canvas'); big.width = bw; big.height = bh;
    const bx = big.getContext('2d'); bx.imageSmoothingQuality = 'high'; bx.drawImage(small, 0, 0, bw, bh);
    small.width = small.height = 1;
    if (f < 1) {
      const nd = bx.getImageData(0, 0, bw, bh), dd = nd.data; let seed = (stroke.pts.length * 7919) | 0;
      for (let i = 0; i < dd.length; i += 4) { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; const g = ((seed >>> 24) / 255 - .5) * 4; dd[i] += g; dd[i + 1] += g; dd[i + 2] += g; }
      bx.putImageData(nd, 0, 0);
    }
    const mask = document.createElement('canvas'); mask.width = bw; mask.height = bh; const mk = mask.getContext('2d');
    mk.filter = `blur(${Math.max(.5, r * .18)}px)`; drawMask(mk, bw, bh, 1, 1, r);
    bx.globalCompositeOperation = 'destination-in'; bx.drawImage(mask, 0, 0);
    ctx.drawImage(big, x0, y0);
    big.width = big.height = mask.width = mask.height = 1;
  }

  // ---- 부분 보정: 칠한 곳(부드러운 가장자리)만 밝기·채도·색온도를 바꾼다 ----
  function adjMask(w, h, strokes) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'), m = Math.min(w, h);
    x.lineCap = x.lineJoin = 'round'; x.strokeStyle = x.fillStyle = '#fff';
    for (const st of strokes) {
      if (st.tool !== 'adj') continue;
      const r = Math.max(2, st.r * m);
      x.lineWidth = r * 2;
      if (st.erase) x.globalCompositeOperation = 'destination-out'; else x.globalCompositeOperation = 'source-over';
      x.beginPath(); st.pts.forEach(([px, py], i) => i ? x.lineTo(px * w, py * h) : x.moveTo(px * w, py * h));
      if (st.pts.length === 1) { x.arc(st.pts[0][0] * w, st.pts[0][1] * h, r, 0, 7); x.fill(); } else x.stroke();
    }
    // 가장자리를 부드럽게
    const soft = document.createElement('canvas'); soft.width = w; soft.height = h;
    const sx = soft.getContext('2d'); sx.filter = `blur(${Math.max(1, Math.round(m / 120))}px)`; sx.drawImage(c, 0, 0);
    c.width = c.height = 1;
    return soft;
  }
  function applyAdj(ctx, w, h, strokes, adj) {
    if (!strokes.some(st => st.tool === 'adj' && !st.erase) || (!adj.exp && !adj.sat && !adj.warm)) return;
    const base = document.createElement('canvas'); base.width = w; base.height = h; base.getContext('2d').drawImage(ctx.canvas, 0, 0);
    const layer = document.createElement('canvas'); layer.width = w; layer.height = h;
    const lx = layer.getContext('2d');
    lx.filter = `brightness(${1 + adj.exp / 100 * .6}) saturate(${1 + adj.sat / 100})`; lx.drawImage(base, 0, 0); lx.filter = 'none';
    if (adj.warm) { lx.globalCompositeOperation = 'soft-light'; lx.globalAlpha = Math.abs(adj.warm) / 100 * .7; lx.fillStyle = adj.warm > 0 ? '#ff9a3c' : '#3c8cff'; lx.fillRect(0, 0, w, h); lx.globalAlpha = 1; }
    const mask = adjMask(w, h, strokes);
    lx.globalCompositeOperation = 'destination-in'; lx.drawImage(mask, 0, 0);
    ctx.drawImage(layer, 0, 0);
    base.width = base.height = layer.width = layer.height = mask.width = mask.height = 1;
  }
  // 전체 다시 그리기 (저장할 때와 되돌리기 때)
  function renderAll(ctx, src, strokes, adj) {
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.drawImage(src, 0, 0, w, h);
    for (const st of strokes) if (st.tool === 'heal') heal(ctx, w, h, st);
    applyAdj(ctx, w, h, strokes, adj);
  }

  function build() {
    dialog = document.createElement('dialog');
    dialog.id = 'retouchDialog';
    dialog.innerHTML = `
      <div class="dialog-head"><h2>잡티·부분 보정</h2><button type="button" class="icon-button" id="rtClose" aria-label="잡티·부분 보정 닫기"><svg><use href="#i-close"/></svg></button></div>
      <div class="text-stage rt-stage"><canvas id="rtCanvas" aria-label="고칠 사진"></canvas></div>
      <p class="text-hint" id="rtHint"></p>
      <div class="deco-tabs rt-tools" role="tablist"><button type="button" data-rttool="heal">잡티 지우기</button><button type="button" data-rttool="adj">부분 보정</button></div>
      <label class="crop-zoom"><span>붓 크기</span><input type="range" id="rtSize" min="1" max="12" step=".5" aria-label="붓 크기"><b id="rtSizeValue"></b></label>
      <div id="rtAdjPane" hidden>
        <div class="text-row" role="group" aria-label="붓"><button type="button" data-rtbrush="paint">칠하기</button><button type="button" data-rtbrush="erase">지우개</button></div>
        <label class="crop-zoom adj"><span>밝기</span><input type="range" data-rtadj="exp" min="-100" max="100" step="1" aria-label="칠한 곳 밝기"><b data-rtadjv="exp">0</b></label>
        <label class="crop-zoom adj"><span>채도</span><input type="range" data-rtadj="sat" min="-100" max="100" step="1" aria-label="칠한 곳 채도"><b data-rtadjv="sat">0</b></label>
        <label class="crop-zoom adj"><span>색온도</span><input type="range" data-rtadj="warm" min="-100" max="100" step="1" aria-label="칠한 곳 색온도"><b data-rtadjv="warm">0</b></label>
        <label class="check-row"><input type="checkbox" id="rtShowMask" checked><span>칠한 곳 표시</span></label>
      </div>
      <div class="deco-adj-actions"><button type="button" class="small-button" id="rtUndo">되돌리기</button><button type="button" class="small-button" id="rtCompare">누르는 동안 원본</button></div>
      <p class="mask-note">사진은 폰 안에서만 고쳐요. 여권·증명사진처럼 보정이 금지된 곳에는 쓰지 마세요.</p>
      <div class="crop-actions"><button type="button" class="small-button" id="rtApply">적용만</button><button type="button" class="primary" id="rtSave">고쳐서 저장</button></div>`;
    document.body.append(dialog);
    const cv = $('rtCanvas');
    $('rtClose').onclick = () => dialog.close();
    dialog.addEventListener('close', () => { if (s) { s.src.width = s.src.height = 1; s.work.width = s.work.height = 1; } s = null; });
    dialog.querySelectorAll('[data-rttool]').forEach(b => b.onclick = () => { s.sizes[s.tool] = s.size; s.tool = b.dataset.rttool; s.size = s.sizes[s.tool]; sync(); paint(); });
    dialog.querySelectorAll('[data-rtbrush]').forEach(b => b.onclick = () => { s.erase = b.dataset.rtbrush === 'erase'; sync(); });
    $('rtSize').oninput = () => { s.size = Number($('rtSize').value); sync(); };
    dialog.querySelectorAll('[data-rtadj]').forEach(r => r.oninput = () => { s.adj[r.dataset.rtadj] = Number(r.value); sync(); paint(); });
    $('rtShowMask').onchange = () => paint();
    $('rtUndo').onclick = () => { if (!s.strokes.length) return; s.strokes.pop(); rebuild(); };
    const cmp = $('rtCompare');
    const showOrig = on => { if (!s) return; if (on) cv.getContext('2d').drawImage(s.src, 0, 0, cv.width, cv.height); else paint(); };
    cmp.addEventListener('pointerdown', () => showOrig(true)); ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => cmp.addEventListener(t, () => showOrig(false)));
    $('rtApply').onclick = () => finish(false);
    $('rtSave').onclick = () => finish(true);
    // 붓질
    let cur = null;
    const pos = e => { const r = cv.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
    cv.addEventListener('pointerdown', e => {
      if (!s) return; cv.setPointerCapture(e.pointerId);
      cur = { tool: s.tool, r: s.size / 100 / 2, pts: [pos(e)] }; if (s.tool === 'adj' && s.erase) cur.erase = true;
      paint(cur);
    });
    cv.addEventListener('pointermove', e => {
      if (!s) return;
      s.hover = pos(e);
      if (cur) { const p = pos(e), q = cur.pts[cur.pts.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > .004) cur.pts.push(p); }
      paint(cur);
    });
    const end = () => {
      if (!cur || !s) { cur = null; return; }
      const st = cur; cur = null; s.strokes.push(st);
      if (st.tool === 'heal') heal(s.work.getContext('2d'), s.work.width, s.work.height, st);
      paint();
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { if (s && !cur) { s.hover = null; paint(); } });
  }

  // 잡티 결과(work)는 붓질마다 이어서 고치고, 부분 보정은 그릴 때마다 위에 얹는다.
  function rebuild() { const x = s.work.getContext('2d'); x.drawImage(s.src, 0, 0); for (const st of s.strokes) if (st.tool === 'heal') heal(x, s.work.width, s.work.height, st); paint(); }
  function paint(live) {
    if (!s) return;
    const cv = $('rtCanvas'), x = cv.getContext('2d'), w = cv.width, h = cv.height;
    x.drawImage(s.work, 0, 0);
    const strokes = live?.tool === 'adj' ? [...s.strokes, live] : s.strokes;
    applyAdj(x, w, h, strokes, s.adj);
    if (s.tool === 'adj' && $('rtShowMask').checked && strokes.some(st => st.tool === 'adj')) {
      const m = adjMask(w, h, strokes), t = document.createElement('canvas'); t.width = w; t.height = h;
      const tx = t.getContext('2d'); tx.fillStyle = 'rgba(200,240,74,.35)'; tx.fillRect(0, 0, w, h); tx.globalCompositeOperation = 'destination-in'; tx.drawImage(m, 0, 0);
      x.drawImage(t, 0, 0); m.width = m.height = t.width = t.height = 1;
    }
    if (live?.tool === 'heal') {
      x.save(); x.strokeStyle = 'rgba(255,90,90,.55)'; x.lineCap = x.lineJoin = 'round'; x.lineWidth = live.r * Math.min(w, h) * 2;
      x.beginPath(); live.pts.forEach(([px, py], i) => i ? x.lineTo(px * w, py * h) : x.moveTo(px * w, py * h)); if (live.pts.length === 1) x.lineTo(live.pts[0][0] * w + .1, live.pts[0][1] * h); x.stroke(); x.restore();
    }
    if (s.hover) { x.save(); x.strokeStyle = '#fff'; x.lineWidth = 2; x.setLineDash([4, 4]); x.beginPath(); x.arc(s.hover[0] * w, s.hover[1] * h, s.size / 100 / 2 * Math.min(w, h), 0, 7); x.stroke(); x.restore(); }
  }
  function sync() {
    dialog.querySelectorAll('[data-rttool]').forEach(b => { const on = b.dataset.rttool === s.tool; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    dialog.querySelectorAll('[data-rtbrush]').forEach(b => { const on = (b.dataset.rtbrush === 'erase') === !!s.erase; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    $('rtAdjPane').hidden = s.tool !== 'adj';
    $('rtSize').value = s.size; $('rtSizeValue').textContent = s.size;
    dialog.querySelectorAll('[data-rtadj]').forEach(r => { const v = s.adj[r.dataset.rtadj] || 0; r.value = v; dialog.querySelector(`[data-rtadjv="${r.dataset.rtadj}"]`).textContent = v > 0 ? '+' + v : v; });
    $('rtHint').textContent = s.tool === 'heal' ? '잡티·점·작은 얼룩을 문지르면 주변 색으로 메워져요. 작게 여러 번 문지르는 게 자연스러워요.' : '고칠 곳을 칠한 뒤 아래 막대로 그 부분만 밝기·채도·색온도를 바꿔요.';
  }

  async function open(item) {
    if (!item || state.busy) return;
    if (SPECS[state.spec]?.noRetouch) { toast('여권 사진은 디지털 보정이 금지라 잡티·부분 보정을 쓸 수 없어요.', true); return; }
    if (!dialog) build();
    try {
      const input = await itemInputFile(item), rotation = item.sourceType === 'pdf' ? 0 : (item.rotation || 0);
      const src = await PhotoSokFace.orientedCanvas(input, rotation, 1400);
      const work = document.createElement('canvas'); work.width = src.width; work.height = src.height; work.getContext('2d').drawImage(src, 0, 0);
      s = { item, input, rotation, src, work, tool: 'heal', size: 3, sizes: { heal: 3, adj: 9 }, erase: false, strokes: [], adj: { exp: 25, sat: 0, warm: 0 }, hover: null };
    } catch (e) { toast(errText(e, '사진을 열지 못했어요. 다시 시도해주세요.'), true); return; }
    const cv = $('rtCanvas'); cv.width = s.src.width; cv.height = s.src.height;
    $('rtShowMask').checked = true;
    sync(); paint();
    dialog.showModal();
  }

  async function finish(save) {
    if (!s) return;
    if (!s.strokes.length) { toast('먼저 고칠 곳을 문지르거나 칠해주세요.', true); return; }
    const { item, input, rotation, strokes, adj } = s;
    const buttons = ['rtApply', 'rtSave'].map($); buttons.forEach(b => b.disabled = true);
    try {
      const full = await PhotoSokFace.orientedCanvas(input, rotation, 4096);
      const out = document.createElement('canvas'); out.width = full.width; out.height = full.height;
      renderAll(out.getContext('2d'), full, strokes, adj); full.width = full.height = 1;
      const blob = await new Promise(r => out.toBlob(r, 'image/jpeg', .95));
      const width = out.width, height = out.height; out.width = out.height = 1;
      if (!blob) throw new Error();
      if (!item.editBackup) item.editBackup = { file: item.file, sourceType: item.sourceType, pageIndex: item.pageIndex, width: item.width, height: item.height, rotation: item.rotation, url: item.url };
      else if (item.url !== item.editBackup.url) URL.revokeObjectURL(item.url);
      const stem = (item.originalFile?.name || item.file.name || '사진').replace(/\.[^.]+$/, '').replace(/_(글씨|꾸미기|선명|보정)$/, '');
      const name = stem + '_보정.jpg';
      item.file = new File([blob], name, { type: 'image/jpeg' });
      item.sourceType = 'photo'; delete item.pageIndex;
      item.url = URL.createObjectURL(item.file); item.width = width; item.height = height; item.rotation = 0;
      delete item.textBase; delete item.textSpec; delete item.decoBase; delete item.decoSpec;
      item.retouched = true; touchItem(item);
      dialog.close(); render();
      if (save) {
        const r = await FileDelivery.save(blob, name);
        if (r.status === 'saved') toast(r.message || '고친 사진을 저장했어요.');
        else if (r.status === 'failed') toast(r.message || '저장하지 못했어요. 다시 시도해주세요.', true);
      } else toast('고친 내용을 적용했어요.');
    } catch (e) { toast(errText(e, '고치지 못했어요. 다시 시도해주세요.'), true); }
    finally { buttons.forEach(b => b.disabled = false); }
  }

  function start() {
    const first = state.items.find(i => i.sourceType !== 'pdf') || state.items[0];
    if (first) { open(first); return; }
    pending = true; $('choose').click();
  }
  function afterAdd(newItems) { if (!pending) return; pending = false; if (newItems && newItems.length) open(newItems[0]); }
  window.PhotoSokRetouch = Object.freeze({ open, start, afterAdd, heal });
})();
