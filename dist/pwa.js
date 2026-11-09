'use strict';
// 설치형 앱 연결: 서비스 워커 등록, 새 버전 알림, 다른 앱에서 공유받은 파일 꺼내기.
(() => {
  const banner = text => {
    let bar = document.getElementById('appUpdate');
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'appUpdate'; bar.className = 'app-update'; bar.setAttribute('role', 'status');
      document.body.append(bar);
    }
    bar.replaceChildren();
    const label = document.createElement('span'); label.textContent = text; bar.append(label);
    return bar;
  };

  async function takeSharedFiles() {
    const params = new URLSearchParams(location.search);
    const shared = params.get('shared');
    if (shared === null) return;
    history.replaceState(null, '', location.pathname);
    if (shared === 'error') { window.toast?.('공유받은 파일을 읽지 못했어요. 파일 담기로 다시 골라주세요.', true); return; }
    if (!('caches' in window)) return;
    const inbox = await caches.open('photosok-share-inbox');
    const files = [];
    for (const request of await inbox.keys()) {
      const response = await inbox.match(request);
      if (!response) continue;
      const blob = await response.blob();
      const name = decodeURIComponent(response.headers.get('x-file-name') || 'shared');
      files.push(new File([blob], name, { type: response.headers.get('content-type') || blob.type, lastModified: Number(response.headers.get('x-file-modified')) || Date.now() }));
      await inbox.delete(request);
    }
    if (!files.length) { window.toast?.('공유받은 파일이 없어요. 파일 담기로 골라주세요.', true); return; }
    // 사진이 아닌 PDF가 섞여 있으면 PDF로 모으기부터 보여준다.
    if (files.some(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) && typeof window.setWorkflow === 'function') window.setWorkflow('pdf');
    await window.addFiles?.(files);
    window.PhotoSokQuick?.open(files);
    if (params.get('over')) window.toast?.('한 번에 20개까지 받아요. 앞의 20개만 담았어요.', true);
  }

  window.addEventListener('load', () => {
    if (window.PhotoSokNative) return; // 안드로이드 앱 안에서는 native.js가 맡는다
    takeSharedFiles().catch(() => window.toast?.('공유받은 파일을 읽지 못했어요.', true));
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    // 처음 설치될 때는 새로고침하지 않는다(담던 파일이 사라지지 않게). 사용자가 '새로 열기'를 누른 경우만 다시 연다.
    let userAskedUpdate = false;
    navigator.serviceWorker.register('sw.js').then(registration => {
      const offer = worker => {
        if (!worker || !navigator.serviceWorker.controller) return;
        const bar = banner('새 버전이 준비됐어요.');
        const button = document.createElement('button'); button.type = 'button'; button.textContent = '새로 열기';
        button.onclick = () => { userAskedUpdate = true; worker.postMessage({ type: 'skip-waiting' }); };
        bar.append(button);
      };
      if (registration.waiting) offer(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed') offer(worker); });
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (userAskedUpdate && !reloaded) { reloaded = true; location.reload(); } });
    }).catch(() => {});
  });
})();
