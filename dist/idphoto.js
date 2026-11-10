'use strict';
// 증명사진 자동 맞춤: 얼굴을 찾아 규격 프레임에 맞게 자르기 위치·확대를 정하고, 머리 크기를 확인한다.
// 배경 흰색: 사람만 남기고 배경을 흰색으로 바꾼다 (자격증·이력서용. 여권은 디지털 보정 금지라 막는다).
(() => {
  const $ = id => document.getElementById(id);
  const faceCache = new WeakMap(); // item.file → 얼굴 결과

  function currentHead() {
    const spec = SPECS[state.spec];
    return spec?.head || { ratio: .62, top: .12, cmH: null };
  }
  async function faceOf(item) {
    const key = item.file;
    if (faceCache.has(key)) return faceCache.get(key);
    const input = await itemInputFile(item);
    const canvas = await PhotoSokFace.orientedCanvas(input, item.sourceType === 'pdf' ? 0 : (item.rotation || 0), 1024);
    const r = await PhotoSokFace.detect(canvas);
    canvas.width = canvas.height = 1;
    faceCache.set(key, r);
    return r;
  }
  // 얼굴 정보 + 프레임으로 자르기 값 계산
  function compute(face, W, H, head) {
    const ow = face.width, oh = face.height, f = face.faces[0];
    if (!f) return { crop: { x: .5, y: .5, zoom: 1 }, note: '얼굴을 찾지 못해 가운데 기준으로 잘랐어요.', ok: false };
    const base = Math.max(W / ow, H / oh);
    const headPx = (f.chinY - f.crownY) * oh;
    let s = head.ratio * H / headPx, zoom = Math.min(4, Math.max(1, s / base));
    s = base * zoom;
    const ovX = ow * s - W, ovY = oh * s - H;
    const dx = -(f.cx * ow - ow / 2) * s;
    const dy = head.top * H - H / 2 - (f.crownY * oh - oh / 2) * s;
    const crop = { x: ovX > 0 ? clamp01(.5 - dx / ovX) : .5, y: ovY > 0 ? clamp01(.5 - dy / ovY) : .5, zoom: +zoom.toFixed(3) };
    return { crop, ...check(face, W, H, head, crop) };
  }
  function check(face, W, H, head, crop) {
    const f = face.faces[0];
    if (!f) return { note: '얼굴을 찾지 못했어요. 손으로 맞춰주세요.', ok: false };
    const ow = face.width, oh = face.height;
    const l = PhotoEngine.coverLayout(ow, oh, W, H, crop);
    const y = v => H / 2 + l.dy + (v * oh - oh / 2) * l.scale;
    const crown = y(f.crownY), chin = y(f.chinY);
    const parts = [];
    let ok = true;
    if (face.faces.length > 1) { parts.push('얼굴이 ' + face.faces.length + '개 보여요'); ok = false; }
    if (crown < -H * .01) { parts.push('머리 위가 잘려요. 조금 더 멀리서 찍은 사진이 좋아요'); ok = false; }
    if (chin > H * .99) { parts.push('턱이 잘려요'); ok = false; }
    if (head.range && head.cmH) {
      const cm = (chin - crown) / H * head.cmH;
      const inRange = cm >= head.range[0] && cm <= head.range[1];
      parts.unshift('머리 길이 약 ' + cm.toFixed(1) + 'cm (기준 ' + head.range[0] + '~' + head.range[1] + 'cm)' + (inRange ? ' ✓' : ''));
      if (!inRange) { ok = false; parts.push(cm > head.range[1] ? '얼굴이 커요. 더 멀리서 찍은 사진이 필요해요' : '얼굴이 작아요. 확대해 주세요'); }
    } else parts.unshift('얼굴에 맞췄어요');
    return { note: parts.join(' · '), ok };
  }
  const clamp01 = v => Math.min(1, Math.max(0, v));

  function frame() { try { const o = options(); return o.exactWidth && o.fit === 'cover' ? { w: o.exactWidth, h: o.exactHeight } : null; } catch { return null; } }

  // 사진들을 얼굴 기준으로 자동 맞춤 (손으로 맞춘 사진은 건드리지 않음)
  async function fitAll(items = state.items) {
    const fr = frame(); if (!fr) return;
    const targets = items.filter(i => i.sourceType !== 'pdf' && (!i.crop || i.cropAuto));
    if (!targets.length) return;
    $('specFaceStatus').hidden = false; $('specFaceStatus').textContent = '얼굴을 찾고 있어요…';
    let fitted = 0, failed = 0;
    for (const item of targets) {
      try {
        const face = await faceOf(item);
        const r = compute(face, fr.w, fr.h, currentHead());
        item.crop = r.crop; item.cropAuto = true; item.faceNote = r.note; item.faceOk = r.ok;
        touchItem(item); if (face.faces.length) fitted++; else failed++;
      } catch (e) { failed++; item.faceNote = e.message || '얼굴 인식을 쓸 수 없어요.'; }
    }
    render();
    $('specFaceStatus').textContent = fitted ? fitted + '장을 얼굴 기준으로 맞췄어요.' + (failed ? ' ' + failed + '장은 얼굴을 못 찾았어요.' : '') + ' 사진마다 결과를 확인해주세요.' : '얼굴을 찾지 못했어요. 손으로 맞춰주세요.';
  }

  const BG = [
    { color: '#ffffff', name: '흰색', suffix: '_흰배경' },
    { color: '#eceef0', name: '연한 회색', suffix: '_배경' },
    { color: '#e3edf7', name: '연한 하늘색', suffix: '_배경' },
    { color: '#bcd6ef', name: '하늘색', suffix: '_배경' },
  ];
  let bgDialog = null, bgTargets = [];
  function chooseBg(items) {
    if (state.busy) return;
    if (SPECS[state.spec]?.noRetouch) { toast('여권 사진은 디지털 보정이 금지라 배경을 바꿀 수 없어요.', true); return; }
    bgTargets = items.filter(i => i && i.sourceType !== 'pdf');
    if (!bgTargets.length) { toast('먼저 사진을 골라주세요.', true); return; }
    if (!bgDialog) {
      bgDialog = document.createElement('dialog');
      bgDialog.id = 'bgDialog'; bgDialog.className = 'bg-dialog';
      bgDialog.innerHTML = `<div class="dialog-head"><h2>배경색 바꾸기</h2><button type="button" class="icon-button" id="bgClose" aria-label="배경색 닫기"><svg><use href="#i-close"/></svg></button></div>
        <div class="bg-swatches">${BG.map((b, i) => `<button type="button" data-bg="${i}"><i style="background:${b.color}"></i><span>${b.name}</span></button>`).join('')}</div>
        <p class="mask-note">사람만 남기고 배경을 고른 색으로 바꿔요. 자격증·이력서처럼 배경색 제한이 느슨한 곳에 쓰세요. 제출처가 정한 배경색이 있으면 그 색을 고르세요. 여권 사진에는 쓸 수 없어요.</p>`;
      document.body.append(bgDialog);
      $('bgClose').onclick = () => bgDialog.close();
      bgDialog.querySelectorAll('[data-bg]').forEach(b => b.onclick = async () => {
        const bg = BG[Number(b.dataset.bg)], list = bgTargets;
        bgDialog.close();
        for (const it of list) await whiten(it, bg);
      });
    }
    bgDialog.showModal();
  }

  async function whiten(item, bg = BG[0]) {
    if (state.busy || !item) return;
    if (SPECS[state.spec]?.noRetouch) { toast('여권 사진은 디지털 보정이 금지라 배경을 바꿀 수 없어요.', true); return; }
    state.busy = true; render();
    try {
      // 이미 배경을 바꾼 사진은 원본에서 다시 바꾼다(가장자리가 덜 뭉개지게). 가리기를 한 뒤면 지금 사진에서.
      const src = item.whiteBg && item.editBackup && !item.masked ? { ...item, ...item.editBackup } : item;
      const input = await itemInputFile(src);
      const canvas = await PhotoSokFace.orientedCanvas(input, src.sourceType === 'pdf' ? 0 : (src.rotation || 0), 3000);
      const out = await PhotoSokFace.whiteBackground(canvas, bg.color);
      canvas.width = canvas.height = 1;
      const blob = await new Promise(res => out.toBlob(res, 'image/jpeg', .95));
      const width = out.width, height = out.height; out.width = out.height = 1;
      if (!blob) throw new Error();
      if (!item.editBackup) item.editBackup = { file: item.file, sourceType: item.sourceType, pageIndex: item.pageIndex, width: item.width, height: item.height, rotation: item.rotation, url: item.url };
      else if (item.url !== item.editBackup.url) URL.revokeObjectURL(item.url);
      const stem = (item.originalFile?.name || item.file.name || '사진').replace(/\.[^.]+$/, '');
      const oldFace = faceCache.get(item.file);
      item.file = new File([blob], stem.replace(/_(흰배경|배경)$/, '') + bg.suffix + '.jpg', { type: 'image/jpeg' });
      if (oldFace) faceCache.set(item.file, oldFace);
      item.sourceType = 'photo'; delete item.pageIndex;
      item.url = URL.createObjectURL(item.file); item.width = width; item.height = height; item.rotation = 0; item.whiteBg = true; item.bgColor = bg.color;
      delete item.textBase; delete item.textSpec; delete item.decoBase; delete item.decoSpec;
      touchItem(item);
      toast('배경을 ' + bg.name + '으로 바꿨어요. 머리카락 가장자리를 비교 화면에서 확인해주세요.');
    } catch (e) { toast(e.message && e.message.length < 60 ? e.message : '배경을 바꾸지 못했어요.', true); }
    finally { state.busy = false; render(); }
  }

  window.PhotoSokID = Object.freeze({ faceOf, compute, check, currentHead, fitAll, whiten, chooseBg, frame, BG });
})();
