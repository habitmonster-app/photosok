'use strict';
// 광고 연결(안드로이드 앱에서만). 배너는 앱이 웹 화면 아래에 따로 붙인다.
// - 편집 창(꾸미기·글씨·자르기·가리기 등)이 열려 있으면 배너를 숨겨 편집 공간을 넓힌다.
// - 저장이 끝나면 앱에 알린다. 여러 장을 연달아 저장하면 다 끝난 뒤 한 번만 알린다.
//   "저장했어요" 카드(네이티브 광고)를 띄울지는 앱이 빈도 규칙(처음 1번 건너뜀, 그 뒤 2번에 1번, 1분 30초 간격)으로 정한다.
// - 보상형: 처음 화면의 "광고 없이 쓰기"에서 광고 한 편을 보면 24시간 동안 광고가 나오지 않는다.
(() => {
  const bridge = window.PhotoSokNative;
  const has = name => !!(bridge && typeof bridge[name] === 'function');
  let timer = 0, lastWhere = '';
  function afterSave(where) {
    if (!has('adBreak')) return;
    if (where) lastWhere = where;
    clearTimeout(timer);
    timer = setTimeout(() => { try { bridge.adBreak(lastWhere); } catch (_) {} }, 1500);
  }
  // ---- 보상형: 광고 한 편 보고 24시간 광고 없이 ----
  const until = () => { try { return Number(bridge.adFreeUntil()) || 0; } catch (_) { return 0; } };
  function timeText(ms) {
    const d = new Date(ms), now = new Date();
    const day = d.getDate() === now.getDate() ? '오늘' : '내일';
    const h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${m}`;
  }
  function syncReward() {
    const card = document.getElementById('adFreeCard'); if (!card) return;
    const u = until(), on = u > Date.now();
    card.classList.toggle('on', on);
    card.querySelector('strong').textContent = on ? '광고 없이 쓰는 중' : '광고 없이 쓰기';
    card.querySelector('small').textContent = on ? timeText(u) + '까지' : '광고 한 편 보고 24시간 광고 없이';
    card.disabled = on;
  }
  function onReward(u, result) {
    if (result === 'ok') toast('24시간 동안 광고 없이 쓸 수 있어요.');
    else if (result === 'notready') toast('광고를 불러오는 중이에요. 잠시 뒤 다시 눌러주세요.', true);
    else if (result === 'skipped') toast('광고를 끝까지 보면 광고 없이 쓸 수 있어요.');
    else if (result === 'failed') toast('광고를 열지 못했어요. 잠시 뒤 다시 시도해주세요.', true);
    syncReward();
  }
  window.PhotoSokAds = Object.freeze({ afterSave, onReward });
  if (has('showRewarded')) {
    const card = document.createElement('button');
    card.type = 'button'; card.id = 'adFreeCard'; card.className = 'ad-free';
    card.innerHTML = '<span class="ad-free-icon"><svg><use href="#i-sparkle"/></svg></span><span><strong></strong><small></small></span><svg class="tool-chev"><use href="#i-chev"/></svg>';
    card.onclick = () => { try { bridge.showRewarded(); } catch (_) {} };
    const lists = document.querySelectorAll('.tool-list');
    lists[lists.length - 1]?.after(card);
    syncReward();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncReward(); });
    setInterval(syncReward, 60000);
  }
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
