'use strict';
// 광고 연결(안드로이드 앱에서만). 배너는 앱이 웹 화면 아래에 따로 붙인다.
// - 편집 창(꾸미기·글씨·자르기·가리기 등)이 열려 있으면 배너를 숨겨 편집 공간을 넓힌다.
// - 저장이 끝나면 앱에 "광고 쉬는 때"를 알린다. 여러 장을 연달아 저장하면 다 끝난 뒤 한 번만 알린다.
//   실제로 전면 광고를 띄울지는 앱이 빈도 규칙(처음 1번 건너뜀, 3번에 1번, 3분 간격)으로 정한다.
(() => {
  const bridge = window.PhotoSokNative;
  const has = name => !!(bridge && typeof bridge[name] === 'function');
  let timer = 0;
  function afterSave() {
    if (!has('adBreak')) return;
    clearTimeout(timer);
    timer = setTimeout(() => { try { bridge.adBreak(); } catch (_) {} }, 1500);
  }
  window.PhotoSokAds = Object.freeze({ afterSave });
  if (!has('setBanner')) return;

  // 배너를 그대로 두는 창: 아래에서 올라오는 목록, 인화용, 공간 확보, 저장 안내
  const KEEP = new Set(['editSheet', 'printDialog', 'cleanDialog']);
  let shown = null;
  function sync() {
    const editing = [...document.querySelectorAll('dialog[open]')].some(d => !KEEP.has(d.id) && !d.classList.contains('fd-dialog'));
    const want = !editing;
    if (want === shown) return;
    shown = want;
    try { bridge.setBanner(want); } catch (_) {}
  }
  new MutationObserver(sync).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
  sync();

  // 유럽 등 동의가 필요한 지역이면 맨 아래에 "광고 개인정보 설정"을 보여 준다.
  function privacyLink() {
    if (!has('adPrivacyRequired')) return;
    let required = false;
    try { required = bridge.adPrivacyRequired(); } catch (_) {}
    if (!required || document.getElementById('adPrivacy')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'adPrivacy'; b.className = 'text-button muted ad-privacy'; b.textContent = '광고 개인정보 설정';
    b.onclick = () => bridge.showAdPrivacy();
    document.querySelector('footer')?.append(b);
  }
  window.addEventListener('load', () => setTimeout(privacyLink, 3000));
})();
