'use strict';
// 사진 카드의 편집 버튼들을 "편집" 한 버튼으로 묶고, 누르면 아래에서 올라오는 목록(바텀 시트)으로 보여 준다.
(() => {
  let sheet = null;
  function build() {
    sheet = document.createElement('dialog');
    sheet.className = 'sheet';
    sheet.id = 'editSheet';
    sheet.innerHTML = '<div class="sheet-grip" aria-hidden="true"></div><p class="sheet-title" id="sheetTitle"></p><div class="sheet-list" id="sheetList"></div><button type="button" class="sheet-cancel" id="sheetCancel">닫기</button>';
    document.body.append(sheet);
    sheet.querySelector('#sheetCancel').onclick = () => sheet.close();
    // 바깥(어두운 부분)을 누르면 닫는다.
    sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });
    // 목록 버튼을 누르면 시트를 먼저 닫고, 그다음 원래 버튼 동작(다른 창 열기)이 이어진다.
    sheet.querySelector('#sheetList').addEventListener('click', e => { if (e.target.closest('button')) sheet.close(); }, true);
  }
  const ICONS = { '꾸미기': 'i-sparkle', '꾸미기 고치기': 'i-sparkle', '글씨 넣기': 'i-text', '글씨 고치기': 'i-text', '가리기': 'i-mask', '더 가리기': 'i-mask', '서류 보정': 'i-pdf', '선명하게': 'i-focus', '스티커 만들기': 'i-sticker', '잡티·부분 보정': 'i-brush', '배경색': 'i-idcard', '배경색 다시': 'i-idcard', '보정 전으로': 'i-convert' };
  function open(title, buttons) {
    if (!sheet) build();
    sheet.querySelector('#sheetTitle').textContent = title;
    const list = sheet.querySelector('#sheetList');
    list.replaceChildren(...buttons.map(b => {
      const label = b.textContent;
      b.classList.add('sheet-row');
      if (!b.querySelector('.sheet-icon')) {
        b.textContent = '';
        const ic = document.createElement('span'); ic.className = 'sheet-icon';
        ic.innerHTML = `<svg><use href="#${b.dataset.icon || 'i-sparkle'}"/></svg>`;
        const t = document.createElement('span'); t.className = 'sheet-label'; t.textContent = label;
        b.append(ic, t);
      }
      if (b.dataset.undo) b.classList.add('sheet-undo');
      return b;
    }));
    sheet.showModal();
  }
  // 카드의 버튼 줄을 "자르기 조절(있으면) + 편집" 으로 줄인다.
  function compact(row, title) {
    if (document.body.dataset.screen === 'classic') return;
    const all = [...row.querySelectorAll('button')];
    const keep = all.filter(b => b.classList.contains('crop-button'));
    const rest = all.filter(b => !keep.includes(b));
    if (!rest.length) return;
    rest.forEach(b => { b.dataset.icon = ICONS[b.textContent.trim()] || 'i-sparkle'; if (b.textContent.trim() === '보정 전으로') b.dataset.undo = '1'; b.remove(); });
    const edit = document.createElement('button');
    edit.type = 'button'; edit.className = 'edit-button';
    edit.innerHTML = '<svg><use href="#i-sparkle"/></svg><span>편집</span>';
    edit.disabled = rest.every(b => b.disabled);
    edit.setAttribute('aria-haspopup', 'dialog');
    edit.onclick = () => open(title, rest);
    row.append(edit);
  }
  window.PhotoSokSheet = Object.freeze({ open, compact });
})();
