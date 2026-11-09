'use strict';
// 얼굴 인식·사람 분리 (MediaPipe, 기기 안에서만 동작). 필요할 때 처음 한 번만 불러온다.
(() => {
  const BASE = new URL('vendor/mediapipe/', document.baseURI).href;
  let visionP = null, landmarkerP = null, segmenterP = null;
  function vision() {
    if (!visionP) visionP = (async () => {
      const mod = await import(BASE + 'vision_bundle.mjs');
      const simd = await mod.FilesetResolver.isSimdSupported();
      if (!simd) throw new Error('이 기기에서는 얼굴 인식을 쓸 수 없어요.');
      const fileset = { wasmLoaderPath: BASE + 'wasm/vision_wasm_internal.js', wasmBinaryPath: BASE + 'wasm/vision_wasm_internal.wasm' };
      return { mod, fileset };
    })().catch(e => { visionP = null; throw e; });
    return visionP;
  }
  function landmarker() {
    if (!landmarkerP) landmarkerP = vision().then(({ mod, fileset }) => mod.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: BASE + 'face_landmarker.task', delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 3,
    })).catch(e => { landmarkerP = null; throw e; });
    return landmarkerP;
  }
  function segmenter() {
    if (!segmenterP) segmenterP = vision().then(({ mod, fileset }) => mod.ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: BASE + 'selfie_segmenter.tflite', delegate: 'CPU' }, runningMode: 'IMAGE',
      outputCategoryMask: false, outputConfidenceMasks: true,
    })).catch(e => { segmenterP = null; throw e; });
    return segmenterP;
  }

  // 회전까지 반영한 캔버스(긴 변 maxEdge)
  async function orientedCanvas(file, rotation, maxEdge) {
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

  // 얼굴 찾기. 결과 좌표는 0~1 (사진 가로·세로에 대한 비율, 회전 반영).
  // crownY 는 이마 위 점(랜드마크 10)과 턱(152) 거리로 추정한 정수리 위치다.
  async function detect(canvas) {
    const lm = await landmarker();
    const res = lm.detect(canvas);
    const faces = (res.faceLandmarks || []).map(p => {
      const xs = p.map(v => v.x), ys = p.map(v => v.y);
      const top = p[10], chin = p[152];
      const crownY = chin.y - (chin.y - top.y) * 1.5;
      const left = Math.min(...xs), right = Math.max(...xs);
      return { cx: (p[234].x + p[454].x) / 2, crownY, chinY: chin.y, eyeY: (p[33].y + p[263].y) / 2, left, right, top: Math.min(...ys), area: (right - left) * (chin.y - top.y) };
    }).sort((a, b) => b.area - a.area);
    return { faces, width: canvas.width, height: canvas.height };
  }

  // 사람만 남기고 배경을 색으로 채운 캔버스를 돌려준다 (가장자리는 부드럽게 섞음).
  async function whiteBackground(canvas, color = '#ffffff') {
    const seg = await segmenter();
    const res = seg.segment(canvas);
    try {
      const mask = res.confidenceMasks[0];
      const mw = mask.width, mh = mask.height, m = mask.getAsFloat32Array();
      // 마스크를 사진 크기로 늘리면서 부드럽게
      const mc = document.createElement('canvas'); mc.width = mw; mc.height = mh;
      const mx = mc.getContext('2d'); const md = mx.createImageData(mw, mh);
      for (let i = 0; i < m.length; i++) { const a = Math.min(1, Math.max(0, (m[i] - 0.35) / 0.4)); md.data[i * 4 + 3] = a * 255; }
      mx.putImageData(md, 0, 0);
      const W = canvas.width, H = canvas.height;
      const big = document.createElement('canvas'); big.width = W; big.height = H;
      const bx = big.getContext('2d'); bx.imageSmoothingQuality = 'high';
      bx.filter = `blur(${Math.max(1, Math.round(Math.max(W, H) / 500))}px)`;
      bx.drawImage(mc, 0, 0, W, H); bx.filter = 'none';
      bx.globalCompositeOperation = 'source-in'; bx.drawImage(canvas, 0, 0);
      const out = document.createElement('canvas'); out.width = W; out.height = H;
      const ox = out.getContext('2d'); ox.fillStyle = color; ox.fillRect(0, 0, W, H); ox.drawImage(big, 0, 0);
      big.width = big.height = mc.width = mc.height = 1;
      return out;
    } finally { res.close?.(); }
  }

  window.PhotoSokFace = Object.freeze({ detect, whiteBackground, orientedCanvas, preload: () => landmarker().catch(() => {}) });
})();
