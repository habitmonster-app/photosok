'use strict';
// 개인정보 가리기: 사진 위에 손가락으로 네모를 그려 모자이크·검정·흐림으로 가린다.
// 결과는 새 JPG로 다시 만들어지므로 가린 부분과 사진 정보(EXIF)는 파일에 남지 않는다.
(() => {
  const $ = id => document.getElementById(id);
  const MODES = { black: '검정', mosaic: '모자이크', blur: '흐리게' };
  let dialog, canvas, session = null, pending = false;

  // 네모 좌표는 0~1 비율이라 미리보기와 저장 결과가 같다.
  function normRect(a, b) {
    const x = Math.max(0, Math.min(a.x, b.x)), y = Math.max(0, Math.min(a.y, b.y));
    const x2 = Math.min(1, Math.max(a.x, b.x)), y2 = Math.min(1, Math.max(a.y, b.y));
    return { x, y, w: x2 - x, h: y2 - y };
  }
  function paint(ctx, image, w, h, rects, mode, draft) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(image, 0, 0, w, h);
    for (const r of rects) cover(ctx, image, w, h, r, r.mode || mode);
    if (draft) {
      ctx.save(); ctx.setLineDash([8, 6]); ctx.lineWidth = 2; ctx.strokeStyle = '#c8f04a';
      ctx.fillStyle = 'rgba(200,240,74,.18)';
      ctx.fillRect(draft.x * w, draft.y * h, draft.w * w, draft.h * h);
      ctx.strokeRect(draft.x * w, draft.y * h, draft.w * w, draft.h * h);
      ctx.restore();
    }
  }
  function cover(ctx, image, w, h, r, mode) {
    const x = Math.round(r.x * w), y = Math.round(r.y * h);
    const rw = Math.max(1, Math.round(r.w * w)), rh = Math.max(1, Math.round(r.h * h));
    if (mode === 'black') { ctx.fillStyle = '#111111'; ctx.fillRect(x, y, rw, rh); return; }
    // 모자이크 칸 크기는 사진 짧은 변 기준이라 해상도가 달라도 같은 모양이 된다.
    const cell = mode === 'mosaic' ? Math.max(6, Math.round(Math.min(w, h) / 36)) : Math.max(6, Math.round(Math.min(w, h) / 30));
    const sw = Math.max(1, Math.ceil(rw / cell)), sh = Math.max(1, Math.ceil(rh / cell));
    const small = document.createElement('canvas'); small.width = sw; small.height = sh;
    const sx = small.getContext('2d');
    sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = 'high';
    sx.drawImage(ctx.canvas, x, y, rw, rh, 0, 0, sw, sh);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, rw, rh); ctx.clip();
    if (mode === 'mosaic') { ctx.imageSmoothingEnabled = false; ctx.drawImage(small, x, y, sw * cell, sh * cell); }
    else {
      // 흐리게: 아주 작게 줄였다가 부드럽게 늘린다 (두 번 반복해 계단 무늬를 없앰)
      const mid = document.createElement('canvas'); mid.width = Math.max(1, sw * 4); mid.height = Math.max(1, sh * 4);
      const mx = mid.getContext('2d'); mx.imageSmoothingQuality = 'high'; mx.drawImage(small, 0, 0, mid.width, mid.height);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(mid, x, y, rw, rh);
      mid.width = mid.height = 1;
    }
    ctx.restore();
    small.width = small.height = 1;
  }

  function build() {
    dialog = document.createElement('dialog');
    dialog.id = 'maskDialog';
    dialog.innerHTML = `
      <div class="dialog-head"><h2>개인정보 가리기</h2><button type="button" class="icon-button" id="maskClose" aria-label="가리기 닫기"><svg><use href="#i-close"/></svg></button></div>
      <div class="text-stage"><canvas id="maskCanvas" aria-label="가릴 곳을 손가락으로 네모 그리기"></canvas></div>
      <p class="text-hint" id="maskHint">가릴 곳을 손가락으로 끌어 네모를 그려주세요.</p>
      <div class="text-row" role="group" aria-label="가리는 방법">${Object.entries(MODES).map(([k, v]) => `<button type="button" data-mmode="${k}">${v}</button>`).join('')}</div>
      <p class="mask-note" id="maskNote"></p>
      <div class="text-row wrap"><button type="button" id="maskFaces">얼굴 찾아 가리기</button><button type="button" id="maskUndo">되돌리기</button><button type="button" id="maskClear">모두 지우기</button></div>
      <div class="crop-actions"><button type="button" class="small-button" id="maskApply">적용만</button><button type="button" class="primary" id="maskSave">가려서 저장</button></div>`;
    document.body.append(dialog);
    canvas = $('maskCanvas');
    $('maskClose').onclick = () => dialog.close();
    dialog.addEventListener('close', () => { session = null; });
    dialog.querySelectorAll('[data-mmode]').forEach(b => b.onclick = () => {
      // 고른 방법은 다음에 그리는 네모부터 적용한다 (이미 검정으로 가린 번호가 바뀌지 않게).
      session.mode = b.dataset.mmode;
      sync(); draw();
    });
    $('maskUndo').onclick = () => { session.rects.pop(); sync(); draw(); };
    $('maskClear').onclick = () => { session.rects = []; sync(); draw(); };
    $('maskFaces').onclick = findFaces;
    $('maskApply').onclick = () => finish(false);
    $('maskSave').onclick = () => finish(true);
    let start = null;
    const pos = e => { const r = canvas.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
    canvas.addEventListener('pointerdown', e => { if (!session) return; canvas.setPointerCapture(e.pointerId); start = pos(e); session.draft = null; });
    canvas.addEventListener('pointermove', e => { if (!start || !session) return; session.draft = normRect(start, pos(e)); draw(); });
    const end = e => {
      if (!start || !session) return;
      const r = normRect(start, pos(e)); start = null; session.draft = null;
      const minPx = 12 / canvas.getBoundingClientRect().width;
      if (r.w >= minPx && r.h >= minPx) { r.mode = session.mode; session.rects.push(r); }
      sync(); draw();
    };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', () => { start = null; if (session) { session.draft = null; draw(); } });
  }
  function sync() {
    const s = session;
    dialog.querySelectorAll('[data-mmode]').forEach(b => { const on = b.dataset.mmode === s.mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    $('maskNote').textContent = s.mode === 'black' ? '주민등록번호·계좌번호처럼 중요한 정보는 검정이 가장 안전해요.'
      : s.mode === 'mosaic' ? '작은 글씨는 모자이크로도 알아볼 수 있어요. 중요한 번호는 검정을 써주세요.'
      : '흐리게는 얼굴이나 배경에 어울려요. 글씨는 검정이 안전해요.';
    $('maskUndo').disabled = $('maskClear').disabled = !s.rects.length;
    $('maskApply').disabled = $('maskSave').disabled = !s.rects.length;
    $('maskHint').textContent = s.rects.length ? s.rects.length + '곳을 가렸어요. 더 그리거나 저장하세요.' : '가릴 곳을 손가락으로 끌어 네모를 그려주세요. 고른 방법은 다음 네모부터 적용돼요.';
  }
  function draw() { if (session) paint(canvas.getContext('2d'), session.preview, canvas.width, canvas.height, session.rects, session.mode, session.draft); }

  async function findFaces() {
    if (!session || !window.PhotoSokFace) return;
    const btn = $('maskFaces'); btn.disabled = true; btn.textContent = '얼굴 찾는 중…';
    try {
      const { faces } = await PhotoSokFace.detect(session.preview);
      if (!faces.length) { toast('얼굴을 찾지 못했어요. 손가락으로 직접 그려주세요.', true); return; }
      const mode = session.mode === 'black' ? 'blur' : session.mode;
      for (const f of faces) {
        const fw = f.right - f.left, fh = f.chinY - f.crownY;
        session.rects.push({ ...normRect({ x: f.left - fw * .12, y: f.crownY - fh * .05 }, { x: f.right + fw * .12, y: f.chinY + fh * .08 }), mode });
      }
      sync(); draw();
      toast(faces.length + '명의 얼굴을 가렸어요. 빠진 얼굴은 직접 그려주세요.');
    } catch (e) { toast(e.message && e.message.length < 60 ? e.message : '얼굴을 찾지 못했어요.', true); }
    finally { btn.disabled = false; btn.textContent = '얼굴 찾아 가리기'; }
  }

  async function open(item) {
    if (!item || state.busy) return;
    if (!dialog) build();
    try {
      const input = await itemInputFile(item);
      const rotation = item.sourceType === 'pdf' ? 0 : (item.rotation || 0);
      const preview = await PhotoSokFace.orientedCanvas(input, rotation, 900);
      canvas.width = preview.width; canvas.height = preview.height;
      session = { item, input, rotation, preview, rects: [], mode: 'black', draft: null };
    } catch (e) { toast('사진을 열지 못했어요. 다시 시도해주세요.', true); return; }
    sync(); draw();
    dialog.showModal();
  }

  async function finish(save) {
    if (!session || !session.rects.length) return;
    const { item, input, rotation, rects, mode } = session;
    const buttons = ['maskApply', 'maskSave'].map($);
    buttons.forEach(b => b.disabled = true);
    try {
      const full = await PhotoSokFace.orientedCanvas(input, rotation, 4096);
      const out = document.createElement('canvas'); out.width = full.width; out.height = full.height;
      paint(out.getContext('2d'), full, out.width, out.height, rects, mode, null);
      full.width = full.height = 1;
      const blob = await new Promise(res => out.toBlob(res, 'image/jpeg', 0.95));
      const width = out.width, height = out.height; out.width = out.height = 1;
      if (!blob) throw new Error();
      if (!item.editBackup) item.editBackup = { file: item.file, sourceType: item.sourceType, pageIndex: item.pageIndex, width: item.width, height: item.height, rotation: item.rotation, url: item.url };
      else if (item.url !== item.editBackup.url) URL.revokeObjectURL(item.url);
      const stem = (item.originalFile?.name || item.file.name || '사진').replace(/\.[^.]+$/, '').replace(/_(글씨|꾸미기|가림)$/, '');
      const name = stem + '_가림.jpg';
      item.file = new File([blob], name, { type: 'image/jpeg' });
      item.sourceType = 'photo'; delete item.pageIndex;
      item.url = URL.createObjectURL(item.file); item.width = width; item.height = height; item.rotation = 0;
      // 가리기 전 사진에서 다시 꾸미면 가린 곳이 되살아나므로, 고치기용 원본을 버린다.
      delete item.textBase; delete item.textSpec; delete item.decoBase; delete item.decoSpec;
      item.masked = true;
      touchItem(item);
      dialog.close(); render();
      if (save) {
        const s = await FileDelivery.save(blob, name);
        if (s.status === 'saved') toast(s.message || '가린 사진을 저장했어요.');
        else if (s.status === 'failed') toast(s.message || '저장하지 못했어요. 다시 시도해주세요.', true);
      } else toast(rects.length + '곳을 가렸어요. 사진 정보(위치·촬영 기기)도 지워졌어요.');
    } catch (e) { toast('가리지 못했어요. 다시 시도해주세요.', true); }
    finally { buttons.forEach(b => b.disabled = false); if (session) sync(); }
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
  window.PhotoSokMask = Object.freeze({ open, start, afterAdd, paint });
})();
