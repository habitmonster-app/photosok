'use strict';
// 첫 화면: 다크·일반 모드 전환, 4칸 기능 타일, 큰 숫자 결과 카드.
// 처리 엔진과 기존 화면 코드(app.js, submission.js)는 바꾸지 않고, 기존 버튼을 대신 눌러 준다.
(() => {
  const $ = id => document.getElementById(id);
  const root = document.documentElement;

  // ---- 화면 모드 ----
  const THEME_KEY = 'photosok-theme';
  function applyTheme(theme) {
    root.dataset.theme = theme;
    const dark = theme === 'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#101213' : '#f3f4f2');
    $('themeToggle')?.setAttribute('aria-label', dark ? '일반 모드로 바꾸기' : '다크 모드로 바꾸기');
    try { window.PhotoSokNative?.setTheme?.(theme); } catch (_) {}
  }
  applyTheme(root.dataset.theme === 'light' ? 'light' : 'dark');
  $('themeToggle')?.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
  });

  // ---- 기능 타일 ----
  const tiles = [...document.querySelectorAll('.tool[data-tool]')];
  function currentTool() {
    try {
      if (state.mode === 'pdf') return 'pdf';
      return state.mode;
    } catch (_) { return 'compress'; }
  }
  function syncTiles() {
    const tool = currentTool();
    let busy = false;
    try { busy = !!state.busy; } catch (_) {}
    tiles.forEach(tile => {
      const on = tile.dataset.tool === tool;
      tile.classList.toggle('active', on);
      tile.setAttribute('aria-pressed', on);
      tile.disabled = busy && !on;
    });
  }
  tiles.forEach(tile => tile.addEventListener('click', () => {
    const tool = tile.dataset.tool;
    if (tool === 'pdf') $('workflowPdf').click();
    else {
      $('workflowPhoto').click();
      document.querySelector(`.mode[data-mode="${tool}"]`)?.click();
    }
    syncTiles();
    document.querySelector('.workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  $('specTile')?.addEventListener('click', () => {
    document.querySelector('.tool[data-tool="compress"]')?.click();
    const d = $('specDetails'); if (d) { d.open = true; setTimeout(() => d.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }
  });

  // ---- 큰 숫자 결과 카드 ----
  const fmt = bytes => bytes >= 1e6 ? (bytes / 1e6).toFixed(bytes >= 1e7 ? 0 : 1) + 'MB' : Math.max(1, Math.round(bytes / 1e3)) + 'KB';
  function setHero(label, valueHtml, ratio, caption) {
    $('heroLabel').textContent = label;
    $('heroValue').innerHTML = valueHtml;
    $('heroBarWrap').hidden = ratio == null;
    if (ratio != null) $('heroBar').style.width = Math.max(3, Math.min(100, ratio * 100)) + '%';
    $('heroCaption').textContent = caption;
  }
  function syncHero() {
    let s, p;
    try { s = state; p = pdfState; } catch (_) { return; }
    if (s.mode === 'pdf' && p?.result) {
      const r = p.result;
      const before = s.items.reduce((sum, i) => sum + (i.file?.size || 0), 0);
      const after = r.blob.size;
      setHero(p.result.mode === 'preserve' ? 'PDF 완성 · 글자 유지' : 'PDF 완성',
        before ? `${fmt(before)} → <b>${fmt(after)}</b>` : `<b>${fmt(after)}</b>`,
        before ? after / before : null,
        `${r.pageCount}페이지 · ${r.mode === 'preserve' ? '용량 제한 없이 합쳤어요' : fmt(r.targetBytes) + ' 이하로 맞췄어요'}`);
      return;
    }
    const done = s.items.filter(i => i.result);
    if (s.mode !== 'pdf' && done.length) {
      const before = [...new Set(done.map(i => i.originalFile || i.file))].reduce((sum, f) => sum + f.size, 0);
      const after = done.reduce((sum, i) => sum + i.result.blob.size, 0);
      const pct = Math.round((1 - after / before) * 100);
      setHero(done.some(i => i.stale) ? '이전 설정의 결과' : '방금 결과', `${fmt(before)} → <b>${fmt(after)}</b>`, after / before,
        `${pct >= 0 ? pct + '% 줄었어요' : Math.abs(pct) + '% 커졌어요'} · ${done.length}장`);
      return;
    }
    if (s.items.length) {
      const total = s.items.reduce((sum, i) => sum + (i.file?.size || 0), 0);
      setHero('담은 파일', `<b>${s.items.length}</b>개 · ${fmt(total)}`, null,
        s.mode === 'pdf' ? '아래에서 PDF 용량을 고르고 만들어 보세요.' : '아래에서 조건을 고르고 바로 줄여 보세요.');
      return;
    }
    let saved = 0;
    try { saved = Number(localStorage.getItem('photosok-saved-total')) || 0; } catch (_) {}
    if (s.mode !== 'pdf' && saved >= 1000) {
      setHero('지금까지 줄인 용량', `<b>${fmt(saved)}</b>`, null, '줄여서 저장한 사진들의 줄어든 용량 합계예요.');
      return;
    }
    setHero(s.mode === 'pdf' ? 'PDF로 모으기' : '사진 · PDF 용량 줄이기', '넣으면 <b>바로 가볍게</b>', null,
      '원하는 용량을 고르면 그 이하로 맞춰요. 원본은 그대로 남아요.');
  }

  let queued = false;
  const sync = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; syncTiles(); syncHero(); }); };
  new MutationObserver(sync).observe(document.querySelector('main'), { subtree: true, childList: true, attributes: true, characterData: true });
  document.addEventListener('photosok-saved', sync);
  sync();
})();
