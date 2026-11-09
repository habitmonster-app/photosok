'use strict';
// PDF output shares the input queue, editor, cancellation, and delivery flow.
names.pdf = PhotoSokCopy.actions.pdfCreate;
const pdfState = {
 mode: 'target', target: 1000000, custom: false,
 result: null, key: null, urls: [], error: null, previewIndex: 0
};
const fileIds = new WeakMap();
let nextFileId = 0;
const photoRender = render, photoInvalidate = invalidate;
const photoProcess = $('process').onclick, photoDemo = $('demo').onclick;
const photoClear = $('clear').onclick, photoMobile = $('mobileAction').onclick;
const photoMobileShare = $('mobileShare').onclick;

function pdfOptions() {
 const options = {mode: pdfState.mode, targetBytes: null, pageSize: $('pdfPageSize').value};
 if (pdfState.mode === 'target') {
  const n = pdfState.custom ? Number($('pdfCustomKB').value) * 1000 : pdfState.target;
  if (!Number.isFinite(n) || n < 100000 || n > 40000000) {
   throw new Error('PDF 전체 용량은 100 ~ 40,000KB로 입력해주세요.');
  }
  options.targetBytes = Math.floor(n);
 }
 return options;
}
function pdfSignature() {
 try {
  return JSON.stringify({
   ...pdfOptions(),
   pages: state.items.map(item => {
    if (!fileIds.has(item.file)) fileIds.set(item.file, ++nextFileId);
    return {
     file: fileIds.get(item.file), sourceType: item.sourceType || 'photo',
     pageIndex: item.sourceType === 'pdf' ? item.pageIndex : null,
     rotation: item.rotation || 0
    };
   })
  });
 } catch { return 'invalid'; }
}
function pdfIsStale() { return !!pdfState.result && pdfState.key !== pdfSignature(); }
function resetPdf() {
 pdfState.urls.forEach(URL.revokeObjectURL);
 pdfState.urls = [];
 pdfState.result = null;
 pdfState.key = null;
 pdfState.error = null;
 pdfState.previewIndex = 0;
 $('pdfPageImage').removeAttribute('src');
}
function pdfFileName() {
 const name = $('pdfName').value.trim().replace(/\.pdf$/i, '')
  .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/^\.+/, '').slice(0, 80).trim();
 return (name || '제출서류') + '.pdf';
}
function pdfFile() { return new File([pdfState.result.blob], pdfFileName(), {type: 'application/pdf'}); }
function canSharePdf() {
 try {
  return !!(pdfState.result && navigator.share && navigator.canShare && navigator.canShare({files: [pdfFile()]}));
 } catch { return false; }
}
async function sharePdf() {
 if (!pdfState.result || state.busy) return;
 if (!canSharePdf()) {
  toast('PDF를 저장한 뒤 보내주세요. 이 브라우저는 파일 직접 공유를 지원하지 않아요.');
  return;
 }
 try {
  await navigator.share({files: [pdfFile()]});
  toast('PDF를 공유 창으로 전달했어요.');
 } catch (e) {
  if (e.name !== 'AbortError') toast('공유 창을 열지 못했어요. PDF를 저장한 뒤 보내주세요.', true);
 }
}
async function savePdf() {
 if (!pdfState.result || state.busy) return;
 const saved = await FileDelivery.save(pdfState.result.blob, pdfFileName());
 if (saved?.status === 'saved') toast(saved.message || 'PDF를 저장했어요.');
 else if (saved?.status === 'failed') toast(saved.message || 'PDF를 저장하지 못했어요. 다시 시도해주세요.', true);
}
function setWorkflow(mode) {
 if (state.busy) return;
 if (mode === 'pdf') { state.mode = 'pdf'; render(); }
 else document.querySelector('[data-mode="compress"]').click();
}

render = function () {
 if (!state.items.length && pdfState.result) resetPdf();
 const pdf = state.mode === 'pdf';
 $('pdfSettings').hidden = !pdf;
 $('pdfFlowHint').hidden = !pdf;
 $('pdfOrderHint').hidden = !pdf;
 document.querySelector('.modes').hidden = pdf;
 $('workflowPdf').classList.toggle('selected', pdf);
 $('workflowPhoto').classList.toggle('selected', !pdf);
 $('workflowPdf').setAttribute('aria-pressed', pdf);
 $('workflowPhoto').setAttribute('aria-pressed', !pdf);
 $('workflowPdf').disabled = $('workflowPhoto').disabled = state.busy;
 const workflowCopy = PhotoSokCopy.workflows[pdf ? 'pdf' : 'photo'];
 document.querySelector('#dropZone h2').textContent = workflowCopy.emptyHeading;
 document.querySelector('#dropZone .file-hint').textContent = workflowCopy.fileHint;
 $('pdfFlowHint').textContent = PhotoSokCopy.flow;
 $('demo').textContent = PhotoSokCopy.actions.demo;
 const chooseLabel = $('choose').querySelector('span') || Array.from($('choose').childNodes)
  .find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
 if (chooseLabel) chooseLabel.textContent = PhotoSokCopy.actions.choose;
 $('files').accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.jpg,.jpeg,.png,.webp,.heic,.heif,.avif,application/pdf,.pdf';
 if (!pdf) {
  $('pdfResult').hidden = $('pdfError').hidden = true;
  photoRender();
  return;
 }
 renderPdf();
};
invalidate = function () {
 if (state.mode !== 'pdf') { photoInvalidate(); return; }
 if (state.busy) return;
 pdfState.error = null;
 render();
};

function refreshPdfModes() {
 const preserve = pdfState.mode === 'preserve';
 document.querySelectorAll('[data-pdf-mode]').forEach(button => {
  const selected = button.dataset.pdfMode === pdfState.mode;
  button.classList.toggle('selected', selected);
  button.setAttribute('aria-pressed', selected);
  button.disabled = state.busy;
 });
 $('pdfTargetControls').hidden = preserve;
 $('pdfResolutionNote').hidden = preserve;
 const hasPhotos = state.items.some(item => item.sourceType !== 'pdf');
 $('pdfLayoutDetails').hidden = preserve && !hasPhotos;
 $('pdfModeNote').textContent = PhotoSokCopy.pdfModes[pdfState.mode].note;
}
function pdfResultNote(result) { return PhotoSokCopy.pdfModes[result.mode].previewNote; }
function renderPdf() {
 const has = !!state.items.length, result = pdfState.result, stale = pdfIsStale();
 const preserve = pdfState.mode === 'preserve';
 refreshPdfModes();
 $('dropZone').hidden = has;
 $('queueSection').hidden = !has;
 $('count').textContent = state.items.length;
 ['compressSettings', 'resizeSettings', 'convertSettings', 'summary', 'saveAll', 'shareAll', 'zipNote', 'staleNote'].forEach(id => $(id).hidden = true);
 document.querySelector('.privacy-option').hidden = true;
 const modeCopy = PhotoSokCopy.pdfModes[pdfState.mode];
 $('settingsTitle').textContent = modeCopy.heading;
 $('outputLabel').textContent = state.items.length + '페이지 → PDF 한 개';
 $('outputNote').textContent = modeCopy.outputNote;
 $('process').querySelector('svg use').setAttribute('href', '#i-pdf');
 $('process').disabled = !has || state.busy;
 $('process').querySelector('span').textContent = state.busy
  ? state.importing ? PhotoSokCopy.actions.importing : PhotoSokCopy.actions.pdfBusy
  : has ? state.items.length + '페이지로 PDF 만들기' : PhotoSokCopy.actions.empty;
 $('cancel').hidden = !state.busy;
 $('progressWrap').hidden = !state.busy;
 document.querySelectorAll('#choose,#camera,#demo,#addMore,#clear,#pdfCustomToggle,#pdfCustomKB,#pdfPageSize,#pdfName,[data-pdf-target],[data-pdf-mode]').forEach(el => el.disabled = state.busy);
 $('pdfResult').hidden = !result;
 $('pdfError').hidden = !pdfState.error;
 if (pdfState.error) $('pdfError').textContent = pdfState.error;
 if (result) {
  const resultPreserved = result.mode === 'preserve';
  $('pdfResult').classList.toggle('old-result', stale);
  $('pdfResultHeading').textContent = stale ? PhotoSokCopy.results.previousPdf
   : PhotoSokCopy.pdfModes[result.mode].resultHeading;
  $('pdfResultSummary').textContent = result.pageCount + '페이지 · ' + fmt(result.bytes)
   + (resultPreserved ? ' · 용량 제한 없음' : ' / ' + fmt(result.targetBytes) + ' 이하');
  const values = [
   ['파일 형식', 'PDF 한 개'],
   ['전체 용량', result.bytes.toLocaleString('ko-KR') + ' 바이트'],
   ['제한 용량', resultPreserved ? '설정하지 않음' : result.targetBytes.toLocaleString('ko-KR') + ' 바이트 이하'],
   ['페이지 수', result.pageCount + '페이지'],
   ['PDF 처리', resultPreserved && result.textPreserved ? '기존 PDF 페이지 내용 유지' : '사진 페이지로 생성'],
   ['위치·촬영정보', result.metadataRemoved ? '제외됨' : '일괄 제거하지 않음']
  ];
  $('pdfChecks').replaceChildren();
  for (const [label, value] of values) {
   const li = document.createElement('li'), name = document.createElement('span'), content = document.createElement('strong');
   name.textContent = label;
   content.textContent = value;
   li.append(name, content);
   $('pdfChecks').append(li);
  }
  const low = resultPreserved ? 0 : result.pages.filter(page => Math.max(page.width, page.height) < 1200).length;
  $('pdfResultWarning').textContent = stale
   ? PhotoSokCopy.results.changed
   : low ? low + '페이지는 저장 해상도가 낮아요. 작은 글씨를 확인해주세요.'
   : PhotoSokCopy.results.checkPages;
  $('pdfPreviewNote').textContent = pdfResultNote(result);
  $('pdfSave').textContent = stale ? '이전 PDF 저장' : 'PDF 저장';
  $('pdfPreviewSave').textContent = stale ? '이전 PDF 저장하기' : 'PDF 저장하기';
  $('pdfShare').textContent = stale ? '이전 PDF 공유' : 'PDF 바로 공유';
  $('pdfShare').hidden = !canSharePdf();
 }
 ['pdfPreview', 'pdfSave', 'pdfPreviewSave', 'pdfShare'].forEach(id => $(id).disabled = state.busy);
 renderPdfPages();
 const ready = !!(result && !stale && !pdfState.error && !state.busy);
 $('mobileBar').hidden = !has;
 document.body.classList.toggle('has-mobile-bar', has);
 $('mobileStatus').textContent = state.busy ? state.importing ? '파일 준비 중…' : 'PDF 만드는 중…'
  : ready ? PhotoSokCopy.pdfModes[result.mode].ready
  : state.items.length + '페이지 → PDF 한 개';
 $('mobileHint').textContent = ready ? fmt(result.bytes) + ' · ' + result.pageCount + '페이지'
  : stale ? '다시 만들면 새 조건으로 적용돼요'
  : preserve ? '기존 PDF 페이지를 유지해요' : 'PDF 전체 용량을 맞춰요';
 $('mobileAction').textContent = state.busy ? '중단' : ready ? 'PDF 저장' : 'PDF 만들기';
 $('mobileShare').hidden = !ready || !canSharePdf();
}
function renderPdfPages() {
 const list = $('photoList');
 list.replaceChildren();
 state.items.forEach((item, index) => {
  const card = document.createElement('article');
  card.className = 'photo-card';
  const img = document.createElement('img');
  img.className = 'photo-thumb';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.width = 76;
  img.height = 76;
  img.src = item.url;
  img.alt = '';
  img.style.transform = 'rotate(' + (item.rotation || 0) + 'deg)';
  img.onerror = () => img.style.visibility = 'hidden';
  const detail = document.createElement('div');
  detail.className = 'photo-detail';
  const label = document.createElement('span');
  label.className = 'page-label';
  label.textContent = (index + 1) + '페이지';
  const name = document.createElement('p');
  name.className = 'filename';
  name.textContent = itemTitle(item);
  name.title = name.textContent;
  const info = document.createElement('p');
  info.className = 'photo-status';
  info.textContent = (item.sourceType === 'pdf' ? '기존 PDF의 ' + (item.pageIndex + 1) + '페이지' : fmt(item.file.size))
   + (item.editBackup ? ' · 보정됨' : '')
   + (item.convertInfo?.converted ? ' · HEIC 변환' : '')
   + (item.rotation ? ' · ' + item.rotation + '° 회전' : '');
  detail.append(label, name, info);
  const controls = document.createElement('div');
  controls.className = 'page-controls';
  const move = offset => {
   if (state.busy) return;
   const next = index + offset;
   if (next < 0 || next >= state.items.length) return;
   [state.items[index], state.items[next]] = [state.items[next], state.items[index]];
   invalidate();
  };
  const up = button('↑', () => move(-1)), down = button('↓', () => move(1));
  const rotate = button('회전 ↻', () => {
   if (state.busy) return;
   item.rotation = ((item.rotation || 0) + 90) % 360;
   item.signature = null;
   item.stale = !!item.result;
   invalidate();
  });
  const edit = button('서류 보정', () => { if (!state.busy) editItem(item); });
  up.setAttribute('aria-label', (index + 1) + '페이지 앞으로');
  down.setAttribute('aria-label', (index + 1) + '페이지 뒤로');
  rotate.setAttribute('aria-label', (index + 1) + '페이지 90도 회전');
  edit.setAttribute('aria-label', (index + 1) + '페이지 서류 보정');
  up.disabled = state.busy || index === 0;
  down.disabled = state.busy || index === state.items.length - 1;
  rotate.disabled = edit.disabled = state.busy;
  controls.append(up, down, rotate, edit);
  if (item.editBackup) {
   const restore = button('보정 전으로', () => { if (!state.busy) restoreItem(item); });
   restore.disabled = state.busy;
   controls.append(restore);
  }
  detail.append(controls);
  const remove = button('', () => {
   if (state.busy) return;
   removeItem(item);
  });
  remove.className = 'remove';
  remove.append(icon('close'));
  remove.setAttribute('aria-label', (index + 1) + '페이지 삭제');
  remove.disabled = state.busy;
  card.append(img, detail, remove);
  list.append(card);
 });
}
async function processPdf() {
 if (state.busy || !state.items.length) return;
 let options;
 try { options = pdfOptions(); }
 catch (error) { toast(error.message, true); return; }
 const key = pdfSignature();
 if (pdfState.result && pdfState.key === key && !pdfState.error) {
  toast('이미 같은 조건으로 만든 PDF가 있어요. 바로 저장할 수 있어요.');
  return;
 }
 state.busy = true;
 state.controller = new AbortController();
 pdfState.error = null;
 $('progress').value = 0;
 $('progressText').textContent = 'PDF를 준비하고 있어요';
 render();
 try {
  const result = await PDFTools.create(state.items, {
   ...options, signal: state.controller.signal,
   onProgress: progress => {
    $('progress').value = progress * 100;
    $('progressText').textContent = (options.mode === 'preserve' ? '페이지를 하나로 묶고 있어요' : '페이지를 묶고 전체 용량을 확인하고 있어요')
     + ' · ' + Math.round(progress * 100) + '%';
   }
  });
  resetPdf();
  pdfState.result = result;
  pdfState.key = key;
  pdfState.urls = result.pages.map(page => URL.createObjectURL(page.blob));
  toast('PDF가 완성됐어요. 페이지를 확인한 뒤 저장해주세요.');
 } catch (error) {
  if (error.name === 'AbortError') toast('작업을 중단했어요. 이전 PDF가 있다면 그대로 보관돼요.');
  else {
   pdfState.error = error.message || 'PDF를 만들지 못했어요. 파일과 목표 용량을 확인해주세요.';
   toast('PDF를 만들지 못했어요. 안내를 확인해주세요.', true);
  }
 } finally {
  state.busy = false;
  state.controller = null;
  render();
 }
}

$('process').onclick = () => state.mode === 'pdf' ? processPdf() : photoProcess();
$('mobileAction').onclick = () => {
 if (state.mode !== 'pdf') { photoMobile(); return; }
 if (state.busy) state.controller?.abort();
 else if (pdfState.result && !pdfIsStale() && !pdfState.error) savePdf();
 else processPdf();
};
$('mobileShare').onclick = () => state.mode === 'pdf' ? sharePdf() : photoMobileShare();
$('clear').onclick = () => { if (state.busy) return; resetPdf(); photoClear(); };
$('workflowPdf').onclick = () => setWorkflow('pdf');
$('workflowPhoto').onclick = () => setWorkflow('photo');
function refreshPdfPresets() {
 document.querySelectorAll('[data-pdf-target]').forEach(button => {
  const selected = !pdfState.custom && Number(button.dataset.pdfTarget) === pdfState.target;
  button.classList.toggle('selected', selected);
  button.setAttribute('aria-pressed', selected);
 });
 $('pdfCustomWrap').hidden = !pdfState.custom;
 $('pdfCustomToggle').setAttribute('aria-expanded', pdfState.custom);
 $('pdfCustomToggle').querySelector('span').textContent = pdfState.custom ? '－' : '＋';
}
document.querySelectorAll('[data-pdf-mode]').forEach(button => button.onclick = () => {
 if (state.busy) return;
 pdfState.mode = button.dataset.pdfMode;
 invalidate();
});
document.querySelectorAll('[data-pdf-target]').forEach(button => button.onclick = () => {
 if (state.busy) return;
 pdfState.target = Number(button.dataset.pdfTarget);
 pdfState.custom = false;
 refreshPdfPresets();
 invalidate();
});
$('pdfCustomToggle').onclick = () => {
 if (state.busy) return;
 pdfState.custom = !pdfState.custom;
 refreshPdfPresets();
 invalidate();
};
$('pdfCustomKB').oninput = $('pdfPageSize').onchange = invalidate;
$('pdfName').oninput = () => { if (state.mode === 'pdf' && !state.busy) render(); };
$('pdfSave').onclick = $('pdfPreviewSave').onclick = savePdf;
$('pdfShare').onclick = sharePdf;
function showPdfPage() {
 const result = pdfState.result;
 if (!result || !result.pages.length) return;
 pdfState.previewIndex = Math.max(0, Math.min(pdfState.previewIndex, result.pageCount - 1));
 const page = result.pages[pdfState.previewIndex];
 $('pdfPageCounter').textContent = (pdfState.previewIndex + 1) + ' / ' + result.pageCount + '페이지';
 $('pdfPrevPage').disabled = pdfState.previewIndex === 0;
 $('pdfNextPage').disabled = pdfState.previewIndex === result.pageCount - 1;
 $('pdfPreviewNote').textContent = pdfResultNote(result);
 const canvas = $('pdfPageCanvas'), img = $('pdfPageImage');
 canvas.style.aspectRatio = page.pageWidth + '/' + page.pageHeight;
 img.src = pdfState.urls[pdfState.previewIndex];
 const rect = page.drawRect;
 img.style.left = (rect.x / page.pageWidth * 100) + '%';
 img.style.top = ((page.pageHeight - rect.y - rect.height) / page.pageHeight * 100) + '%';
 img.style.width = (rect.width / page.pageWidth * 100) + '%';
 img.style.height = (rect.height / page.pageHeight * 100) + '%';
}
$('pdfPreview').onclick = () => {
 if (!pdfState.result || state.busy) return;
 pdfState.previewIndex = 0;
 showPdfPage();
 $('pdfPreviewDialog').showModal();
};
$('pdfClosePreview').onclick = () => $('pdfPreviewDialog').close();
$('pdfPrevPage').onclick = () => { pdfState.previewIndex--; showPdfPage(); };
$('pdfNextPage').onclick = () => { pdfState.previewIndex++; showPdfPage(); };
$('pdfPreviewDialog').addEventListener('close', () => $('pdfPageImage').removeAttribute('src'));
$('demo').onclick=async()=>{if(state.mode!=='pdf'){await photoDemo();return;}$('demo').disabled=true;try{const files=[];for(let page=1;page<=2;page++){const c=document.createElement('canvas');c.width=1500;c.height=2100;const x=c.getContext('2d');x.fillStyle='#f7f5ef';x.fillRect(0,0,1500,2100);x.fillStyle='#18353f';x.font='bold 68px sans-serif';x.fillText(page===1?'첨부 자료 확인서':'사진쏙 샘플 목록',120,200);x.font='30px sans-serif';x.fillStyle='#60767b';x.fillText('사진쏙 샘플 · 기능 확인용 가상 서류 · '+page+' / 2',120,270);x.fillStyle='#dcece6';x.fillRect(120,345,1260,90);x.fillStyle='#176e67';x.font='bold 32px sans-serif';x.fillText('항목',155,402);x.fillText('내용 확인',800,402);for(let row=0;row<12;row++){const y=510+row*100;x.strokeStyle='#d6ded9';x.lineWidth=2;x.beginPath();x.moveTo(120,y+30);x.lineTo(1380,y+30);x.stroke();x.fillStyle='#18353f';x.font='30px sans-serif';x.fillText((row+1)+'. 준비할 자료',155,y);x.fillText(page===1?'자료 '+String(row+1).padStart(2,'0'):'확인할 내용 '+(row+1),800,y);}x.fillStyle='#8f5743';x.font='27px sans-serif';x.fillText('기능 확인용 가상 서류입니다. 실제 제출 자료가 아닙니다.',120,1900);const blob=await new Promise(res=>c.toBlob(res,'image/png'));if(!blob)throw Error();files.push(new File([blob],'사진쏙_샘플서류_'+page+'.png',{type:'image/png'}));c.width=c.height=1;}await addFiles(files);toast('가상 서류 두 장을 담았어요. 저장 조건을 골라 PDF로 모아보세요.');}catch{toast('예시를 불러오지 못했어요. 사진을 선택해주세요.',true);}finally{$('demo').disabled=false;}};

refreshPdfPresets();
setWorkflow('pdf');
