'use strict';
// 첫 실행 소개 3장. 언제든 건너뛸 수 있고, 한 번 보면 다시 나오지 않는다.
// 자동 검사(브라우저 자동화)에서는 띄우지 않는다. 주소에 ?onboard=1 을 붙이면 항상 보인다.
(() => {
  const KEY = 'photosok-onboarded';
  const force = /[?&]onboard=1/.test(location.search);
  let seen = false;
  try { seen = localStorage.getItem(KEY) === '1'; } catch (_) {}
  if (!force && (seen || navigator.webdriver)) return;

  const SLIDES = [
    { art: '<div class="ob-big"><s>5.2MB</s><b>480KB</b></div>', title: '원하는 용량으로 딱', text: '100KB, 200KB, 500KB… 고르면 그 이하로 맞춰요. 원본 사진은 그대로 남아요.' },
    { art: '<div class="ob-icon"><svg><use href="#i-lock"/></svg></div>', title: '고른 사진만 열어요', text: '줄이기·꾸미기는 사진 접근 권한 없이 써요. 공간 확보를 쓸 때만 갤러리 권한을 물어요. 파일은 휴대폰 밖으로 보내지 않아요.' },
    { art: '<div class="ob-chips"><span>증명사진 규격</span><span>꾸미기</span><span>개인정보 가리기</span><span>PDF로 모으기</span></div>', title: '제출용부터 인스타까지', text: '자격증·여권 사진, 필터와 글씨, 신분증 가리기까지 한 앱에서 해요.' },
  ];
  const d = document.createElement('dialog');
  d.id = 'onboard'; d.className = 'onboard';
  d.innerHTML = `<div class="ob-track">${SLIDES.map((s, i) => `<section class="ob-slide" aria-hidden="${i ? 'true' : 'false'}"><div class="ob-art">${s.art}</div><h2>${s.title}</h2><p>${s.text}</p></section>`).join('')}</div>
    <div class="ob-dots" aria-hidden="true">${SLIDES.map(() => '<i></i>').join('')}</div>
    <div class="ob-actions"><button type="button" class="ob-skip" id="obSkip">건너뛰기</button><button type="button" class="primary ob-next" id="obNext" autofocus>다음</button></div>`;
  let i = 0;
  const track = () => d.querySelector('.ob-track');
  function show(n) {
    i = Math.max(0, Math.min(SLIDES.length - 1, n));
    track().style.transform = `translateX(${-i * 100}%)`;
    d.querySelectorAll('.ob-slide').forEach((s, k) => s.setAttribute('aria-hidden', k !== i));
    d.querySelectorAll('.ob-dots i').forEach((dot, k) => dot.classList.toggle('on', k === i));
    d.querySelector('#obNext').textContent = i === SLIDES.length - 1 ? '시작하기' : '다음';
    d.querySelector('#obSkip').style.visibility = i === SLIDES.length - 1 ? 'hidden' : 'visible';
  }
  function done() {
    try { localStorage.setItem(KEY, '1'); } catch (_) {}
    d.close();
  }
  function init() {
    document.body.append(d);
    d.querySelector('#obSkip').onclick = done;
    d.querySelector('#obNext').onclick = () => i === SLIDES.length - 1 ? done() : show(i + 1);
    d.addEventListener('cancel', e => { e.preventDefault(); done(); });
    d.addEventListener('close', () => d.remove());
    // 손가락으로 넘기기
    let x0 = null;
    d.addEventListener('pointerdown', e => { x0 = e.clientX; });
    d.addEventListener('pointerup', e => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 50) show(i + (dx < 0 ? 1 : -1)); });
    show(0);
    d.showModal();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
