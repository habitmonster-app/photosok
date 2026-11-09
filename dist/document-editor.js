(function () {
  'use strict';
  const MAX_PIXELS = 6000000, MAX_EDGE = 3000;
  const CORNERS = ['왼쪽 위', '오른쪽 위', '오른쪽 아래', '왼쪽 아래'];
  let current = null;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const aborted = signal => { if (signal && signal.aborted) throw new DOMException('편집을 취소했어요.', 'AbortError'); };
  function validQuad(points, width, height) {
    if (!Array.isArray(points) || points.length !== 4 || width < 2 || height < 2) return false;
    if (points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > width - 1 || p.y > height - 1)) return false;
    const edgeMin = Math.min(8, Math.max(1, Math.min(width, height) * .02));
    const tolerance = Math.max(1e-7, width * height * 1e-8);
    let area = 0;
    for (let i = 0; i < 4; i++) {
      const a = points[i], b = points[(i + 1) % 4], c = points[(i + 2) % 4];
      if (distance(a, b) < edgeMin || (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= tolerance) return false;
      area += a.x * b.y - a.y * b.x;
    }
    return area / 2 >= Math.min(64, Math.max(1, width * height * .00001));
  }
  function homography(points) {
    const [p0, p1, p2, p3] = points;
    const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
    const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
    let g = 0, h = 0;
    const scale = Math.max(1, ...points.map(p => Math.max(Math.abs(p.x), Math.abs(p.y))));
    if (Math.abs(dx3) + Math.abs(dy3) > scale * 1e-12) {
      const det = dx1 * dy2 - dx2 * dy1;
      if (Math.abs(det) < scale * scale * 1e-12) throw new Error('모서리 위치가 너무 가까워요. 영역을 조금 넓혀주세요.');
      g = (dx3 * dy2 - dx2 * dy3) / det;
      h = (dx1 * dy3 - dx3 * dy1) / det;
    }
    if (Math.min(1, 1 + g, 1 + h, 1 + g + h) <= 1e-8) throw new Error('이 모양은 보정하기 어려워요. 모서리를 다시 맞춰주세요.');
    return [p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x,
      p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y, g, h];
  }
  function project(matrix, u, v) {
    const d = matrix[6] * u + matrix[7] * v + 1;
    return { x: (matrix[0] * u + matrix[1] * v + matrix[2]) / d, y: (matrix[3] * u + matrix[4] * v + matrix[5]) / d };
  }
  function outputSize(points, maxPixels = MAX_PIXELS, maxEdge = MAX_EDGE) {
    const w = Math.max(distance(points[0], points[1]), distance(points[3], points[2])) + 1;
    const h = Math.max(distance(points[0], points[3]), distance(points[1], points[2])) + 1;
    const scale = Math.min(1, maxEdge / Math.max(w, h), Math.sqrt(maxPixels / (w * h)));
    return { width: Math.max(2, Math.floor(w * scale + 1e-7)), height: Math.max(2, Math.floor(h * scale + 1e-7)) };
  }
  async function warpPixels(source, width, height, points, options = {}) {
    if (!(source instanceof Uint8ClampedArray) || source.length !== width * height * 4 || !validQuad(points, width, height)) throw new Error('네 모서리가 겹치지 않도록 문서 테두리에 맞춰주세요.');
    aborted(options.signal);
    const size = outputSize(points, options.maxPixels || MAX_PIXELS, options.maxEdge || MAX_EDGE);
    const out = new Uint8ClampedArray(size.width * size.height * 4), m = homography(points);
    for (let y = 0; y < size.height; y++) {
      const v = y / (size.height - 1), yNum = m[4] * v + m[5], xNum = m[1] * v + m[2], denominator = m[7] * v + 1;
      for (let x = 0; x < size.width; x++) {
        const u = x / (size.width - 1), d = m[6] * u + denominator;
        const sx = clamp((m[0] * u + xNum) / d, 0, width - 1), sy = clamp((m[3] * u + yNum) / d, 0, height - 1);
        const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(x0 + 1, width - 1), y1 = Math.min(y0 + 1, height - 1);
        const fx = sx - x0, fy = sy - y0;
        const i0 = (y0 * width + x0) * 4, i1 = (y0 * width + x1) * 4, i2 = (y1 * width + x0) * 4, i3 = (y1 * width + x1) * 4;
        const a0 = (1 - fx) * (1 - fy) * source[i0 + 3], a1 = fx * (1 - fy) * source[i1 + 3], a2 = (1 - fx) * fy * source[i2 + 3], a3 = fx * fy * source[i3 + 3];
        const alpha = a0 + a1 + a2 + a3, dest = (y * size.width + x) * 4;
        out[dest + 3] = alpha;
        if (alpha > 0) for (let channel = 0; channel < 3; channel++) out[dest + channel] = (source[i0 + channel] * a0 + source[i1 + channel] * a1 + source[i2 + channel] * a2 + source[i3 + channel] * a3) / alpha;
      }
      if (y % 32 === 0 || y === size.height - 1) {
        if (options.onProgress) options.onProgress((y + 1) / size.height);
        await new Promise(resolve => setTimeout(resolve, 0));
        aborted(options.signal);
      }
    }
    return { data: out, width: size.width, height: size.height };
  }
  async function decode(blob) {
    if (!(blob instanceof Blob) || !blob.size) throw new Error('편집할 사진을 불러오지 못했어요.');
    if (typeof createImageBitmap === 'function') {
      try { const image = await createImageBitmap(blob, { imageOrientation: 'from-image' }); return { image, width: image.width, height: image.height, close: () => image.close() }; } catch (_) { /* Use browser image decoder when bitmap decoding is unavailable. */ }
    }
    const url = URL.createObjectURL(blob);
    try {
      const image = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('이 사진은 브라우저에서 열 수 없어요. JPG·PNG·WebP를 사용해주세요.')); img.src = url; });
      return { image, width: image.naturalWidth, height: image.naturalHeight, close: () => { image.src = ''; } };
    } finally { URL.revokeObjectURL(url); }
  }
  const png = canvas => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('편집한 사진을 저장하지 못했어요. 다시 시도해주세요.')), 'image/png'));
  function makeDialog() {
    const dialog = document.createElement('dialog'); dialog.className = 'de-dialog'; dialog.setAttribute('aria-labelledby', 'de-title');
    dialog.innerHTML = `<div class="de-heading"><div><p class="de-eyebrow">서류를 반듯하게</p><h2 id="de-title">테두리 자르기 · 원근 보정</h2></div><button type="button" class="de-close" aria-label="편집 닫기">×</button></div><p class="de-name"></p><div class="de-mode" aria-label="편집 방식"><button type="button" data-de-mode="perspective" class="is-selected" aria-pressed="true">네 모서리 보정</button><button type="button" data-de-mode="rectangle" aria-pressed="false">직사각형 자르기</button></div><p class="de-instructions" id="de-instructions">숫자가 적힌 점 4개를 끌어 문서 모서리에 맞춰주세요.<br><span>자동 인식이 아니에요. 방향키로도 조절할 수 있어요.</span></p><div class="de-workarea"><div class="de-canvas-wrap"><canvas class="de-source" aria-label="편집할 원본 사진"></canvas><svg class="de-overlay" aria-hidden="true"><path class="de-shade" fill-rule="evenodd"></path><polygon class="de-outline"></polygon></svg></div><div class="de-preview" hidden><img alt="문서 보정 결과 미리보기"></div></div><div class="de-under-image"><span class="de-dimensions"></span><button type="button" class="de-reset">모서리 초기화</button></div><p class="de-error" role="alert" hidden></p><div class="de-progress" hidden><progress max="100" value="0"></progress><p role="status">보정 중…</p></div><div class="de-footer"><button type="button" class="de-cancel">취소</button><button type="button" class="de-preview-button">결과 미리보기</button><button type="button" class="de-apply">적용하기</button></div><p class="de-footnote">최대 600만 화소·긴 변 3,000px로 처리해요. 미리보기로 글자와 테두리를 확인해주세요.</p>`;
    return dialog;
  }
  async function open(blob, options = {}) {
    if (current) throw new Error('열려 있는 편집을 먼저 마쳐주세요.');
    const opener = document.activeElement, dialog = makeDialog(); current = dialog;
    const q = selector => dialog.querySelector(selector), imageWrap = q('.de-canvas-wrap'), canvas = q('.de-source'), overlay = q('.de-overlay');
    q('.de-name').textContent = options.name || '선택한 사진';
    let source = null, sourcePixels = null, points = [], mode = 'perspective', previewURL = null, previewShown = false, working = false, finished = false, observer = null;
    const controller = new AbortController();
    let resolveResult;
    const resultPromise = new Promise(resolve => { resolveResult = resolve; });
    function finish(result) {
      if (finished) return; finished = true; controller.abort();
      if (observer) observer.disconnect();
      if (previewURL) URL.revokeObjectURL(previewURL);
      if (source) source.close(); source = null; sourcePixels = null;
      canvas.width = canvas.height = 1;
      dialog.close(); dialog.remove(); current = null;
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
      resolveResult(result);
    }
    q('.de-close').onclick = q('.de-cancel').onclick = () => finish(null);
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
    document.body.append(dialog); dialog.showModal();
    function message(text) { q('.de-error').textContent = text; q('.de-error').hidden = !text; }
    function busy(value) {
      working = value;
      dialog.querySelectorAll('.de-mode button,.de-handle,.de-reset,.de-preview-button,.de-apply').forEach(button => { button.disabled = value; });
      q('.de-progress').hidden = !value;
      q('.de-apply').textContent = value ? '보정 중…' : '적용하기';
    }
    function resetPreview() {
      previewShown = false; q('.de-preview').hidden = true; imageWrap.hidden = false;
      q('.de-preview-button').textContent = '결과 미리보기';
      if (previewURL) { URL.revokeObjectURL(previewURL); previewURL = null; q('.de-preview img').removeAttribute('src'); }
    }
    function renderPoints() {
      const path = points.map(p => `${p.x},${p.y}`).join(' ');
      q('.de-outline').setAttribute('points', path);
      q('.de-shade').setAttribute('d', `M0,0 H${canvas.width} V${canvas.height} H0 Z M${points.map(p => `${p.x},${p.y}`).join(' L')} Z`);
      dialog.querySelectorAll('.de-handle').forEach((button, i) => { button.style.left = `${points[i].x / (canvas.width - 1) * 100}%`; button.style.top = `${points[i].y / (canvas.height - 1) * 100}%`; button.setAttribute('aria-label', `${i + 1} ${CORNERS[i]} 모서리, 가로 ${Math.round(points[i].x / (canvas.width - 1) * 100)}%, 세로 ${Math.round(points[i].y / (canvas.height - 1) * 100)}%. 방향키로 이동`); });
      const size = outputSize(points);
      q('.de-dimensions').textContent = `예상 결과 ${size.width.toLocaleString()} × ${size.height.toLocaleString()}px`;
    }
    function move(index, x, y) {
      if (working || finished || previewShown) return;
      const candidate = points.map(p => ({ ...p })), p = { x: clamp(x, 0, canvas.width - 1), y: clamp(y, 0, canvas.height - 1) };
      if (mode === 'rectangle') {
        const opposite = points[(index + 2) % 4], min = Math.min(12, Math.min(canvas.width, canvas.height) / 4);
        p.x = index === 0 || index === 3 ? Math.min(p.x, opposite.x - min) : Math.max(p.x, opposite.x + min);
        p.y = index === 0 || index === 1 ? Math.min(p.y, opposite.y - min) : Math.max(p.y, opposite.y + min);
        candidate[index] = p;
        candidate[(index + 1) % 4][index % 2 === 0 ? 'y' : 'x'] = p[index % 2 === 0 ? 'y' : 'x'];
        candidate[(index + 3) % 4][index % 2 === 0 ? 'x' : 'y'] = p[index % 2 === 0 ? 'x' : 'y'];
      } else candidate[index] = p;
      if (!validQuad(candidate, canvas.width, canvas.height)) { message('모서리가 서로 겹치지 않도록 조금 넓혀주세요.'); return; }
      points = candidate; message(''); resetPreview(); renderPoints();
    }
    q('.de-reset').onclick = () => { if (working) return; points = [{ x: 0, y: 0 }, { x: canvas.width - 1, y: 0 }, { x: canvas.width - 1, y: canvas.height - 1 }, { x: 0, y: canvas.height - 1 }]; message(''); resetPreview(); renderPoints(); };
    dialog.querySelectorAll('[data-de-mode]').forEach(button => { button.onclick = () => { mode = button.dataset.deMode; dialog.querySelectorAll('[data-de-mode]').forEach(b => { b.classList.toggle('is-selected', b === button); b.setAttribute('aria-pressed', b === button); }); if (mode === 'rectangle') { const left = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x)), top = Math.min(...points.map(p => p.y)), bottom = Math.max(...points.map(p => p.y)); points = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }]; } message(''); resetPreview(); renderPoints(); }; });
    async function makeResult(preview) {
      const warped = await warpPixels(sourcePixels, canvas.width, canvas.height, points, { maxPixels: preview ? 1000000 : MAX_PIXELS, maxEdge: preview ? 1200 : MAX_EDGE, signal: controller.signal, onProgress: p => { if (!finished) { q('.de-progress progress').value = Math.round(p * 100); q('.de-progress p').textContent = `${preview ? '미리보기' : '사진'} 보정 중 ${Math.round(p * 100)}%`; } } });
      aborted(controller.signal);
      const output = document.createElement('canvas'); output.width = warped.width; output.height = warped.height;
      try { output.getContext('2d').putImageData(new ImageData(warped.data, warped.width, warped.height), 0, 0); const file = await png(output); aborted(controller.signal); return { blob: file, width: warped.width, height: warped.height }; }
      finally { output.width = output.height = 1; }
    }
    q('.de-preview-button').onclick = async () => {
      if (working) return;
      if (previewShown) { resetPreview(); return; }
      busy(true); message('');
      try { const result = await makeResult(true); if (finished) return; if (previewURL) URL.revokeObjectURL(previewURL); previewURL = URL.createObjectURL(result.blob); q('.de-preview img').src = previewURL; q('.de-preview').hidden = false; imageWrap.hidden = true; previewShown = true; q('.de-preview-button').textContent = '모서리 다시 조절'; }
      catch (error) { if (!finished && error.name !== 'AbortError') message(error.message || '미리보기를 만들지 못했어요.'); }
      finally { if (!finished) busy(false); }
    };
    q('.de-apply').onclick = async () => {
      if (working) return; busy(true); message('');
      try { const result = await makeResult(false); if (!finished) finish(result); }
      catch (error) { if (!finished && error.name !== 'AbortError') { message(error.message || '보정하지 못했어요. 다시 시도해주세요.'); busy(false); } }
    };
    busy(true); q('.de-progress p').textContent = '사진을 불러오는 중…';
    try {
      source = await decode(blob); if (finished) { source.close(); source = null; return resultPromise; }
      if (source.width < 2 || source.height < 2) throw new Error('사진이 너무 작아요. 가로·세로 2픽셀 이상의 사진을 선택해주세요.');
      const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height), Math.sqrt(MAX_PIXELS / (source.width * source.height)));
      canvas.width = Math.max(2, Math.floor(source.width * scale)); canvas.height = Math.max(2, Math.floor(source.height * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) throw new Error('브라우저에서 사진 편집을 시작하지 못했어요.');
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'; context.drawImage(source.image, 0, 0, canvas.width, canvas.height); source.close(); source = null;
      sourcePixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      overlay.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
      function resizeDisplay() { imageWrap.style.maxWidth = `${Math.max(100, Math.min(window.innerHeight * .48, 520)) * canvas.width / canvas.height}px`; }
      resizeDisplay(); observer = new ResizeObserver(resizeDisplay); observer.observe(dialog);
      for (let index = 0; index < 4; index++) {
        const handle = document.createElement('button'); handle.type = 'button'; handle.className = 'de-handle'; handle.textContent = index + 1; handle.setAttribute('aria-describedby', 'de-instructions'); imageWrap.append(handle);
        handle.addEventListener('pointerdown', event => { if (working) return; event.preventDefault(); handle.focus(); handle.setPointerCapture(event.pointerId); });
        handle.addEventListener('pointermove', event => { if (!handle.hasPointerCapture(event.pointerId)) return; const rect = canvas.getBoundingClientRect(); move(index, (event.clientX - rect.left) / rect.width * (canvas.width - 1), (event.clientY - rect.top) / rect.height * (canvas.height - 1)); });
        const release = event => { if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId); };
        handle.addEventListener('pointerup', release); handle.addEventListener('pointercancel', release);
        handle.addEventListener('keydown', event => { const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]; if (!delta || working) return; event.preventDefault(); const rect = canvas.getBoundingClientRect(), step = (event.shiftKey ? 10 : 1) * canvas.width / Math.max(1, rect.width); move(index, points[index].x + delta[0] * step, points[index].y + delta[1] * step); });
      }
      busy(false); q('.de-reset').click();
    } catch (error) {
      if (!finished) { message(error.message || '사진을 불러오지 못했어요.'); q('.de-progress').hidden = true; q('.de-apply').textContent = '적용하기'; }
    }
    return resultPromise;
  }
  window.DocumentEditor = Object.freeze({ open, geometry: Object.freeze({ validQuad, homography, project, outputSize, warpPixels }) });
})();
