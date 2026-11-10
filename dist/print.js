'use strict';
// 증명사진 인화용 한 장: 4×6인치(10×15cm) 인화지 한 장에 규격 사진을 실제 크기로 여러 장 배치한다.
// 300dpi 기준 1200×1800px. 사진 크기는 규격 픽셀(300dpi 환산값) 그대로라 인화하면 실제 cm 크기가 된다.
(() => {
  const $ = id => document.getElementById(id);
  // 용지 (300dpi 기준 픽셀)
  const PAPERS = {
    '4x6': { w: 1200, h: 1800, label: '4×6인치 (10×15cm)', file: '4x6', note: '사진관이나 무인 인화기에서 4×6인치(10×15cm)로' },
    '5x7': { w: 1500, h: 2100, label: '5×7인치 (13×18cm)', file: '5x7', note: '사진관이나 무인 인화기에서 5×7인치(13×18cm)로' },
    'a4': { w: 2480, h: 3508, label: 'A4 (집 프린터)', file: 'A4', note: '집 프린터에서 A4 용지에 "실제 크기(100%)"로' },
  };
  const GAPS = { 0: '붙이기', 24: '2mm', 47: '4mm' }; // 자를 자리
  const MARGIN = 36; // 약 3mm (인화기가 가장자리를 조금 잘라도 사진이 남게)
  let dialog = null, current = null, paper = '4x6', GAP = 24, photo = null;
  let SHEET = PAPERS[paper];

  function layout(pw, ph) {
    const fit = (W, H) => {
      const cols = Math.floor((W - MARGIN * 2 + GAP) / (pw + GAP));
      const rows = Math.floor((H - MARGIN * 2 + GAP) / (ph + GAP));
      return { W, H, cols, rows, n: Math.max(0, cols) * Math.max(0, rows) };
    };
    const a = fit(SHEET.w, SHEET.h), b = fit(SHEET.h, SHEET.w);
    return b.n > a.n ? b : a;
  }

  async function compose(photoBlob, pw, ph) {
    const L = layout(pw, ph);
    if (!L.n) throw new Error('사진이 인화지보다 커요.');
    const bmp = await createImageBitmap(photoBlob);
    const c = document.createElement('canvas'); c.width = L.W; c.height = L.H;
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, L.W, L.H);
    const gw = L.cols * pw + (L.cols - 1) * GAP, gh = L.rows * ph + (L.rows - 1) * GAP;
    const ox = Math.round((L.W - gw) / 2), oy = Math.round((L.H - gh) / 2);
    // 자를 자리 안내선 (사진 바깥 여백에만, 연한 회색)
    x.strokeStyle = '#d0d0d0'; x.lineWidth = 1;
    for (let i = 0; i <= L.cols; i++) {
      const lx = i === 0 ? ox - GAP / 2 : ox + i * (pw + GAP) - GAP / 2;
      x.beginPath(); x.moveTo(lx + .5, 0); x.lineTo(lx + .5, L.H); x.stroke();
    }
    for (let j = 0; j <= L.rows; j++) {
      const ly = j === 0 ? oy - GAP / 2 : oy + j * (ph + GAP) - GAP / 2;
      x.beginPath(); x.moveTo(0, ly + .5); x.lineTo(L.W, ly + .5); x.stroke();
    }
    for (let j = 0; j < L.rows; j++) for (let i = 0; i < L.cols; i++) x.drawImage(bmp, ox + i * (pw + GAP), oy + j * (ph + GAP), pw, ph);
    bmp.close();
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95));
    const url = c.toDataURL('image/jpeg', 0.7);
    c.width = c.height = 1;
    if (!blob) throw new Error();
    return { blob, url, n: L.n, cols: L.cols, rows: L.rows, landscape: L.W > L.H };
  }

  function build() {
    dialog = document.createElement('dialog');
    dialog.id = 'printDialog';
    dialog.innerHTML = `
      <div class="dialog-head"><h2>인화용 한 장</h2><button type="button" class="icon-button" id="printClose" aria-label="인화용 한 장 닫기"><svg><use href="#i-close"/></svg></button></div>
      <div class="text-stage"><img id="printPreview" alt="인화용 배치 미리보기"></div>
      <p class="print-summary" id="printSummary"></p>
      <div class="print-opts"><span>용지</span><div class="chip-row" id="printPaper">${Object.entries(PAPERS).map(([k, p]) => `<button type="button" data-paper="${k}">${p.label}</button>`).join('')}</div></div>
      <div class="print-opts"><span>간격</span><div class="chip-row" id="printGap">${Object.entries(GAPS).map(([k, v]) => `<button type="button" data-gap="${k}">${v}</button>`).join('')}</div></div>
      <p class="mask-note" id="printNote"></p>
      <div class="crop-actions"><button type="button" class="small-button" id="printShare">공유</button><button type="button" class="primary" id="printSave">인화용 사진 저장</button></div>`;
    document.body.append(dialog);
    $('printClose').onclick = () => dialog.close();
    dialog.querySelectorAll('[data-paper]').forEach(b => b.onclick = () => { paper = b.dataset.paper; SHEET = PAPERS[paper]; refresh(); });
    dialog.querySelectorAll('[data-gap]').forEach(b => b.onclick = () => { GAP = Number(b.dataset.gap); refresh(); });
    $('printSave').onclick = async () => {
      if (!current) return;
      const s = await FileDelivery.save(current.blob, current.name);
      if (s.status === 'saved') toast(s.message || '인화용 사진을 저장했어요.');
      else if (s.status === 'failed') toast(s.message || '저장하지 못했어요. 다시 시도해주세요.', true);
    };
    $('printShare').onclick = async () => {
      if (!current) return;
      const r = await FileDelivery.share(new File([current.blob], current.name, { type: 'image/jpeg' }));
      if (r.status === 'unsupported' || r.status === 'failed') toast(r.message, true);
    };
  }

  async function refresh() {
    if (!photo) return;
    const { spec, stem } = photo;
    dialog.querySelectorAll('[data-paper]').forEach(b => b.setAttribute('aria-pressed', b.dataset.paper === paper));
    dialog.querySelectorAll('[data-gap]').forEach(b => b.setAttribute('aria-pressed', Number(b.dataset.gap) === GAP));
    try {
      const r = await compose(photo.blob, spec.w, spec.h);
      current = { ...r, name: stem + '_인화용_' + SHEET.file + '.jpg' };
      $('printPreview').src = r.url;
      const cm = (spec.w / 300 * 2.54).toFixed(1) + '×' + (spec.h / 300 * 2.54).toFixed(1) + 'cm';
      $('printSummary').textContent = cm + ' 사진 ' + r.n + '장 (' + r.cols + '×' + r.rows + ')' + (r.landscape ? ' · 가로로 배치' : '');
      $('printNote').textContent = SHEET.note + ', 화면 맞춤·테두리 없이 원본 크기로 인화하세요. ' + (GAP ? '연한 회색 선을 따라 자르면 돼요. ' : '') + '기기 설정에 따라 크기가 조금 달라질 수 있으니 처음 한 장으로 확인해주세요.';
    } catch (e) { current = null; toast(e.message && e.message.length < 60 ? e.message : '인화용 사진을 만들지 못했어요.', true); }
  }

  async function make() {
    const key = state.spec, spec = SPECS[key];
    if (!spec) { toast('먼저 사진 규격을 골라주세요.', true); return; }
    const item = state.items.find(i => i.sourceType !== 'pdf') || state.items[0];
    if (!item) { toast('먼저 사진을 골라주세요.', true); $('choose').click(); return; }
    const btn = $('printSheet'); btn.disabled = true; const label = btn.textContent; btn.textContent = '만드는 중…';
    try {
      const input = await itemInputFile(item);
      // 인화용은 용량 제한 없이 높은 화질로 규격 크기만 맞춘다.
      const p = await PhotoEngine.transform(input, { mode: 'compress', targetBytes: 4000000, exactWidth: spec.w, exactHeight: spec.h, fit: 'cover', crop: item.crop, rotation: item.sourceType === 'pdf' ? 0 : (item.rotation || 0), quality: .95, stripMetadata: true, format: 'image/jpeg' });
      const stem = (item.originalFile?.name || item.file.name || '사진').replace(/\.[^.]+$/, '').replace(/_(글씨|꾸미기|가림|흰배경|배경|선명)$/, '');
      photo = { blob: p.blob, spec, stem };
      if (!dialog) build();
      await refresh();
      dialog.showModal();
    } catch (e) { toast(e.message && e.message.length < 60 ? e.message : '인화용 사진을 만들지 못했어요.', true); }
    finally { btn.disabled = false; btn.textContent = label; }
  }

  window.PhotoSokPrint = Object.freeze({ make, layout, compose, PAPERS });
})();
