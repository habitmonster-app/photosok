'use strict';
// 자르기 조절: 규격(가로·세로 지정 + 잘라 채우기)일 때 사진마다 위치·확대를 손으로 맞춘다.
// 결과는 item.crop = {x, y, zoom} 으로 저장되고 PhotoEngine.transform 의 crop 옵션으로 그대로 쓰인다.
(() => {
  const $ = id => document.getElementById(id);
  let dialog, canvas, ctx, zoomInput, session = null;

  function build() {
    dialog = document.createElement('dialog');
    dialog.id = 'cropDialog';
    dialog.innerHTML = `
      <div class="dialog-head"><h2>자르기 조절</h2><button type="button" class="icon-button" id="cropClose" aria-label="자르기 조절 닫기"><svg><use href="#i-close"/></svg></button></div>
      <p class="crop-hint" id="cropHint">사진을 끌어서 위치를 옮기고, 두 손가락이나 아래 막대로 확대해요.</p>
      <div class="crop-stage"><div class="crop-frame"><span class="cr-w" id="crW" hidden></span><canvas id="cropCanvas" aria-label="자를 영역 미리보기"></canvas><span class="cr-h" id="crH" hidden></span></div></div>
      <p class="crop-size" id="cropSize"></p>
      <label class="crop-zoom"><span>확대</span><input type="range" id="cropZoom" min="100" max="400" value="100" step="1" aria-label="확대"></label>
      <p class="crop-face" id="cropFace" hidden></p><div class="crop-actions three"><button type="button" class="small-button" id="cropFaceFit">얼굴에 맞추기</button><button type="button" class="small-button" id="cropReset">가운데로</button><button type="button" class="primary" id="cropApply">이대로 자르기</button></div>`;
    document.body.append(dialog);
    canvas = $('cropCanvas'); ctx = canvas.getContext('2d'); zoomInput = $('cropZoom');
    $('cropClose').onclick = () => dialog.close();
    $('cropReset').onclick = () => { if (!session) return; session.auto = false; Object.assign(session.crop, { x: 0.5, y: 0.5, zoom: 1 }); zoomInput.value = 100; draw(); };
    $('cropApply').onclick = apply;
    $('cropFaceFit').onclick = async () => {
      if (!session) return;
      const s = session; $('cropFaceFit').disabled = true; $('cropFace').hidden = false; $('cropFace').textContent = '얼굴을 찾고 있어요…';
      try {
        const face = s.face || (s.face = await PhotoSokID.faceOf(s.item));
        if (session !== s) return;
        const r = PhotoSokID.compute(face, s.w, s.h, PhotoSokID.currentHead());
        Object.assign(s.crop, r.crop); zoomInput.value = Math.round(s.crop.zoom * 100); s.auto = true; draw();
      } catch (e) { $('cropFace').textContent = e.message || '얼굴 인식을 쓸 수 없어요.'; }
      finally { $('cropFaceFit').disabled = false; }
    };
    zoomInput.oninput = () => { if (!session) return; session.auto = false; session.crop.zoom = zoomInput.value / 100; draw(); };
    dialog.addEventListener('close', () => { session?.source.close(); session = null; });
    const pointers = new Map();
    let pinch = 0;
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); pinch = 0; });
    canvas.addEventListener('pointermove', e => {
      if (!session || !pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId);
      const now = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, now);
      if (pointers.size === 1) {
        const ratio = canvas.width / canvas.getBoundingClientRect().width;
        const l = layout();
        const c = session.crop;
        session.auto = false;
        if (l.overflowX > 0) c.x = Math.min(1, Math.max(0, c.x - (now.x - prev.x) * ratio / l.overflowX));
        if (l.overflowY > 0) c.y = Math.min(1, Math.max(0, c.y - (now.y - prev.y) * ratio / l.overflowY));
        draw();
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) setZoom(session.crop.zoom * dist / pinch);
        pinch = dist;
      }
    });
    const end = e => { pointers.delete(e.pointerId); pinch = 0; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', e => { if (!session) return; e.preventDefault(); setZoom(session.crop.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
  }

  function setZoom(z) { session.auto = false; session.crop.zoom = Math.min(4, Math.max(1, z)); zoomInput.value = Math.round(session.crop.zoom * 100); draw(); }
  function layout() { const s = session; return PhotoEngine.coverLayout(s.ow, s.oh, canvas.width, canvas.height, s.crop); }

  function draw() {
    if (!session) return;
    const { source, rotation } = session;
    const w = canvas.width, h = canvas.height, l = layout();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2 + l.dx, h / 2 + l.dy);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source.image, -source.width * l.scale / 2, -source.height * l.scale / 2, source.width * l.scale, source.height * l.scale);
    ctx.restore();
    // 3분할 안내선 + 가운데 세로선 (얼굴 가운데 맞추기용)
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(1, w / 300);
    ctx.setLineDash([w / 60, w / 60]);
    for (const f of [1 / 3, 2 / 3]) { line(w * f, 0, w * f, h); line(0, h * f, w, h * f); }
    ctx.strokeStyle = 'rgba(200,240,74,.95)'; ctx.lineWidth = Math.max(2, w / 160); ctx.setLineDash([]); line(w / 2, 0, w / 2, h);
    // 규격일 때: 정수리·턱이 올 자리 (얼굴에 맞추기 기준)
    if (session.spec) {
      const hd = PhotoSokID.currentHead(), y1 = hd.top * h, y2 = (hd.top + hd.ratio) * h;
      ctx.strokeStyle = 'rgba(80,170,255,.9)'; ctx.lineWidth = Math.max(1.5, w / 220); ctx.setLineDash([w / 40, w / 60]);
      line(w * .22, y1, w * .78, y1); line(w * .3, y2, w * .7, y2);
      ctx.setLineDash([]); ctx.fillStyle = 'rgba(80,170,255,.95)'; ctx.font = `600 ${Math.round(w / 26)}px sans-serif`;
      ctx.fillText('정수리', w * .79, y1 + w / 80); ctx.fillText('턱', w * .71, y2 + w / 80);
    }
    ctx.restore();
    if (session.face) { const r = PhotoSokID.check(session.face, session.w, session.h, PhotoSokID.currentHead(), session.crop); $('cropFace').hidden = false; $('cropFace').textContent = r.note; $('cropFace').classList.toggle('warn', !r.ok); }
    const moveX = l.overflowX > 1, moveY = l.overflowY > 1;
    $('cropHint').textContent = moveX && moveY ? '사진을 끌어서 위치를 옮기고, 두 손가락이나 아래 막대로 확대해요.'
      : moveX ? '양옆으로 끌어서 위치를 옮겨요. 확대하면 위아래도 옮길 수 있어요.'
      : moveY ? '위아래로 끌어서 위치를 옮겨요. 확대하면 양옆도 옮길 수 있어요.'
      : '확대하면 끌어서 위치를 옮길 수 있어요.';
  }
  function line(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

  function apply() {
    if (!session) return;
    const { item, crop } = session;
    item.crop = { x: +crop.x.toFixed(4), y: +crop.y.toFixed(4), zoom: +crop.zoom.toFixed(3) };
    item.cropAuto = !!session.auto;
    if (session.face) { const r = PhotoSokID.check(session.face, session.w, session.h, PhotoSokID.currentHead(), item.crop); item.faceNote = (session.auto ? '' : '손으로 맞춤 · ') + r.note; item.faceOk = r.ok; }
    touchItem(item);
    dialog.close();
    render();
    toast('자르기 위치를 정했어요. 다시 처리하면 반영돼요.');
  }

  async function open(item, width, height) {
    if (!dialog) build();
    let source;
    try {
      const input = await itemInputFile(item);
      source = await PhotoEngine.decode(input);
    } catch (e) { toast('사진을 열지 못했어요. 다시 시도해주세요.', true); return; }
    const rotation = item.sourceType === 'pdf' ? 0 : (item.rotation || 0);
    const quarter = rotation === 90 || rotation === 270;
    const ps = Math.min(1, 720 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * ps));
    canvas.height = Math.max(1, Math.round(height * ps));
    session = { item, source, rotation, w: width, h: height, auto: !!item.cropAuto, face: null, ow: quarter ? source.height : source.width, oh: quarter ? source.width : source.height, crop: { x: 0.5, y: 0.5, zoom: 1, ...(item.crop || {}) } };
    zoomInput.value = Math.round(session.crop.zoom * 100);
    const spec = SPECS[state.spec]; session.spec = spec && spec.w === width && spec.h === height ? spec : null;
    const mm = v => Math.round(v / 300 * 25.4);
    $('crW').hidden = $('crH').hidden = !session.spec;
    if (session.spec) { $('crW').textContent = mm(width) + 'mm · ' + width + 'px'; $('crH').textContent = mm(height) + 'mm · ' + height + 'px'; }
    $('cropSize').textContent = session.spec ? '초록 선이 가운데, 파란 점선이 정수리·턱 자리예요' : '저장 크기 ' + width + ' × ' + height + 'px · 초록 선이 가운데예요';
    $('cropFace').hidden = true; $('cropFace').classList.remove('warn');
    draw();
    dialog.showModal();
    const s = session;
    PhotoSokID.faceOf(item).then(face => { if (session === s) { s.face = face; draw(); } }).catch(() => {});
  }

  window.PhotoSokCrop = Object.freeze({ open });
})();
