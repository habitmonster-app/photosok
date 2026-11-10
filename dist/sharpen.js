'use strict';
// 선명하게: 흐릿한 사진의 윤곽을 살리고 자잘한 노이즈를 줄인다. 모두 기기 안에서 계산한다(서버·AI 모델 없음).
// 밝기 성분에만 적용해 색 번짐을 막는다. 초점이 크게 나간 사진을 새로 그려내지는 못한다.
(() => {
  const $ = id => document.getElementById(id);
  const LEVELS = { 1: { name: '약하게', amount: .6 }, 2: { name: '보통', amount: 1.1 }, 3: { name: '강하게', amount: 1.8 } };
  let dialog = null, session = null, pending = false, timer = 0;

  // 가로·세로 상자 흐림(누적합, O(N)). 두 번 돌리면 가우스 흐림에 가깝다.
  function boxBlur(src, w, h, r, tmp, out) {
    const d = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const o = y * w; let s = 0;
      for (let k = -r; k <= r; k++) s += src[o + Math.min(w - 1, Math.max(0, k))];
      for (let x = 0; x < w; x++) {
        tmp[o + x] = s / d;
        s += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s / d;
        s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
    return out;
  }

  // canvas 를 그 자리에서 고친다. level 1~3, denoise true/false
  function process(canvas, level = 2, denoise = true) {
    const w = canvas.width, h = canvas.height, n = w * h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, w, h), px = img.data;
    const Y = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n), T = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) Y[i] = .299 * px[j] + .587 * px[j + 1] + .114 * px[j + 2];
    // 1) 노이즈 줄이기: 주변과 차이가 작은(평평한) 곳만 부드럽게
    const Yd = new Float32Array(Y);
    if (denoise) {
      boxBlur(Y, w, h, 1, T, A);
      for (let i = 0; i < n; i++) { const diff = A[i] - Y[i], k = Math.max(0, 1 - Math.abs(diff) / 14) * .85; Yd[i] = Y[i] + diff * k; }
    }
    // 2) 윤곽 살리기(언샤프 마스크): 사진 크기에 맞춘 반경
    const r = Math.max(1, Math.round(Math.max(w, h) / 1400));
    boxBlur(Yd, w, h, r, T, A); boxBlur(A, w, h, r, T, B);
    const amt = LEVELS[level].amount;
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const det = Yd[i] - B[i], ad = Math.abs(det);
      const gate = ad < 2 ? ad / 2 : 1; // 아주 작은 떨림은 덜 키운다
      const delta = (Yd[i] + det * amt * gate) - Y[i];
      px[j] = px[j] + delta; px[j + 1] = px[j + 1] + delta; px[j + 2] = px[j + 2] + delta; // Uint8Clamped 가 0~255로 자른다
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  function build() {
    dialog = document.createElement('dialog');
    dialog.id = 'sharpDialog';
    dialog.innerHTML = `
      <div class="dialog-head"><h2>선명하게</h2><button type="button" class="icon-button" id="sharpClose" aria-label="선명하게 닫기"><svg><use href="#i-close"/></svg></button></div>
      <div class="sharp-stage" id="sharpStage"><canvas id="sharpBefore" aria-label="고치기 전"></canvas><canvas id="sharpAfter" aria-label="고친 뒤"></canvas><div class="sharp-split" id="sharpSplit"><i></i></div><span class="sharp-tag l">전</span><span class="sharp-tag r">후</span></div>
      <p class="crop-hint">가운데 선을 끌어서 전과 후를 비교해요.</p>
      <div class="print-opts"><span>세기</span><div class="chip-row" id="sharpLevel">${Object.entries(LEVELS).map(([k, v]) => `<button type="button" data-level="${k}">${v.name}</button>`).join('')}</div></div>
      <label class="check-row"><input type="checkbox" id="sharpNoise" checked><span>자잘한 노이즈 줄이기</span></label>
      <p class="mask-note">흐릿한 윤곽을 또렷하게 하고 자글자글한 노이즈를 줄여요. 사진은 폰 안에서만 고쳐요. 초점이 크게 나간 사진은 많이 좋아지지 않을 수 있어요. 여권 사진처럼 보정이 금지된 곳에는 쓰지 마세요.</p>
      <div class="crop-actions"><button type="button" class="small-button" id="sharpApply">적용만</button><button type="button" class="primary" id="sharpSave">선명하게 저장</button></div>`;
    document.body.append(dialog);
    $('sharpClose').onclick = () => dialog.close();
    dialog.querySelectorAll('[data-level]').forEach(b => b.onclick = () => { session.level = Number(b.dataset.level); preview(); });
    $('sharpNoise').onchange = () => { session.denoise = $('sharpNoise').checked; preview(); };
    $('sharpApply').onclick = () => commit(false);
    $('sharpSave').onclick = () => commit(true);
    dialog.addEventListener('close', () => { session = null; });
    // 비교 선 끌기
    const stage = $('sharpStage');
    const move = e => { const r = stage.getBoundingClientRect(); setSplit((e.clientX - r.left) / r.width); };
    stage.addEventListener('pointerdown', e => { stage.setPointerCapture(e.pointerId); move(e); });
    stage.addEventListener('pointermove', e => { if (stage.hasPointerCapture(e.pointerId)) move(e); });
  }
  function setSplit(f) {
    f = Math.min(1, Math.max(0, f));
    $('sharpAfter').style.clipPath = `inset(0 0 0 ${f * 100}%)`;
    $('sharpSplit').style.left = f * 100 + '%';
  }

  function preview() {
    if (!session) return;
    dialog.querySelectorAll('[data-level]').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.level) === session.level));
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!session) return;
      const a = $('sharpAfter'), b = $('sharpBefore');
      a.width = b.width; a.height = b.height;
      a.getContext('2d').drawImage(b, 0, 0);
      process(a, session.level, session.denoise);
    }, 30);
  }

  async function open(item) {
    if (!item || state.busy) return;
    if (SPECS[state.spec]?.noRetouch) { toast('여권 사진은 디지털 보정이 금지라 선명하게를 쓸 수 없어요.', true); return; }
    if (!dialog) build();
    let input;
    try {
      input = await itemInputFile(item);
      const rotation = item.sourceType === 'pdf' ? 0 : (item.rotation || 0);
      const small = await PhotoSokFace.orientedCanvas(input, rotation, 900);
      const b = $('sharpBefore'); b.width = small.width; b.height = small.height;
      b.getContext('2d').drawImage(small, 0, 0); small.width = small.height = 1;
      $('sharpStage').style.aspectRatio = b.width + ' / ' + b.height;
      session = { item, input, rotation, level: 2, denoise: true };
    } catch (e) { toast('사진을 열지 못했어요. 다시 시도해주세요.', true); return; }
    $('sharpNoise').checked = true;
    setSplit(.5);
    preview();
    dialog.showModal();
  }

  async function commit(save) {
    if (!session) return;
    const { item, input, rotation, level, denoise } = session;
    const buttons = ['sharpApply', 'sharpSave'].map($);
    buttons.forEach(b => b.disabled = true);
    try {
      const full = await PhotoSokFace.orientedCanvas(input, rotation, 4096);
      process(full, level, denoise);
      const blob = await new Promise(res => full.toBlob(res, 'image/jpeg', 0.95));
      const width = full.width, height = full.height; full.width = full.height = 1;
      if (!blob) throw new Error();
      if (!item.editBackup) item.editBackup = { file: item.file, sourceType: item.sourceType, pageIndex: item.pageIndex, width: item.width, height: item.height, rotation: item.rotation, url: item.url };
      else if (item.url !== item.editBackup.url) URL.revokeObjectURL(item.url);
      const stem = (item.originalFile?.name || item.file.name || '사진').replace(/\.[^.]+$/, '').replace(/_(글씨|꾸미기|선명)$/, '');
      const name = stem + '_선명.jpg';
      item.file = new File([blob], name, { type: 'image/jpeg' });
      item.sourceType = 'photo'; delete item.pageIndex;
      item.url = URL.createObjectURL(item.file); item.width = width; item.height = height; item.rotation = 0;
      delete item.textBase; delete item.textSpec; delete item.decoBase; delete item.decoSpec;
      item.sharpened = true;
      touchItem(item);
      dialog.close(); render();
      if (save) {
        const s = await FileDelivery.save(blob, name);
        if (s.status === 'saved') toast(s.message || '선명하게 고친 사진을 저장했어요.');
        else if (s.status === 'failed') toast(s.message || '저장하지 못했어요. 다시 시도해주세요.', true);
      } else toast('선명하게 고쳤어요. 비교 화면에서 확인해주세요.');
    } catch (e) { toast('선명하게 고치지 못했어요. 다시 시도해주세요.', true); }
    finally { buttons.forEach(b => b.disabled = false); }
  }

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
  window.PhotoSokSharpen = Object.freeze({ open, start, afterAdd, process });
})();
