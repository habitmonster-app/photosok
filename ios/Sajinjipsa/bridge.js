'use strict';
// 아이폰 앱 연결. 안드로이드 앱과 같은 이름(window.PhotoSokNative)·같은 함수로 만들어서
// 웹앱(native.js, ads.js)을 고치지 않고 그대로 쓴다.
// 안드로이드는 앱 함수가 곧바로 값을 돌려주므로, 아이폰에서도 그렇게 되도록 prompt()로 앱에 묻는다
// (앱이 답을 줄 때까지 웹 코드는 기다린다). 표시는 되지 않는다.
(() => {
  if (window.PhotoSokNative) return;
  const MARK = '__photosok_bridge__';
  const call = (m, a) => {
    const r = window.prompt(MARK, JSON.stringify({ m, a }));
    if (r == null || r === '') return undefined;
    try { return JSON.parse(r); } catch (_) { return undefined; }
  };
  const api = {};
  ['begin', 'append', 'save', 'share', 'setTheme', 'takeShared', 'setBanner', 'adBreak', 'showRewarded',
   'adFreeUntil', 'adsAvailable', 'adPrivacyRequired', 'showAdPrivacy'].forEach(m => { api[m] = (...a) => call(m, a); });
  window.PhotoSokNative = Object.freeze(api);
  document.documentElement.classList.add('ios-app');
  // 공간 확보(갤러리 정리)는 아직 안드로이드 전용이라 아이폰에서는 숨긴다.
  const style = document.createElement('style');
  style.textContent = '.ios-app #cleanTile{display:none!important}';
  document.documentElement.appendChild(style);
})();
