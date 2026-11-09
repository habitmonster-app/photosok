'use strict';
// 사진쏙 서비스 워커: 앱을 설치형으로 쓰고, 인터넷 없이도 열리게 한다.
// 사용자 파일은 외부로 보내지 않는다. 공유로 받은 파일도 이 기기 캐시에 잠깐 두었다가 앱이 꺼내면 지운다.
const VERSION = 'v1.16.0';
const SHELL = 'photosok-shell-' + VERSION;
const TOOLS = 'photosok-tools-' + VERSION;
const INBOX = 'photosok-share-inbox';

const SHELL_FILES = [
  './', 'index.html', 'licenses.html', 'manifest.webmanifest',
  'style.css', 'document-editor.css', 'file-delivery.css',
  'compress.js', 'crop.js', 'text.js', 'decorate.js', 'face.js', 'idphoto.js', 'i18n-en.js', 'i18n.js', 'pdf.js', 'pdf-tools.js', 'heic-support.js', 'heic-worker.js',
  'document-editor.js', 'file-delivery.js', 'ui-copy.js', 'app.js', 'submission.js', 'pwa.js', 'native.js', 'home.js', 'quick.js', 'fonts/PretendardVariable-subset.woff2',
  'assets/brand-mark.svg', 'assets/file-desk.svg', 'assets/inbox.svg',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'
];
// 큰 도구 파일: 설치할 때 미리 받아 두면 첫 PDF·HEIC 작업도 인터넷 없이 된다.
const TOOL_FILES = [
  'vendor/pdf-lib.min.js', 'vendor/pdfjs/pdf.mjs', 'vendor/pdfjs/pdf.worker.mjs',
  'vendor/heic-to/heic-to.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(SHELL_FILES.map(path => new Request(path, { cache: 'reload' })));
    // 도구 파일은 실패해도 설치를 막지 않는다(처음 쓸 때 다시 받는다).
    const tools = await caches.open(TOOLS);
    await Promise.allSettled(TOOL_FILES.map(path => tools.add(new Request(path, { cache: 'reload' }))));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, TOOLS, INBOX]);
    for (const key of await caches.keys()) if (key.startsWith('photosok-') && !keep.has(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'skip-waiting') self.skipWaiting();
});

async function receiveShare(request) {
  const scope = new URL(self.registration.scope);
  try {
    const form = await request.formData();
    const files = form.getAll('files').filter(file => file && typeof file === 'object' && file.size > 0);
    const inbox = await caches.open(INBOX);
    for (const old of await inbox.keys()) await inbox.delete(old);
    let index = 0;
    for (const file of files.slice(0, 20)) {
      const key = new URL('__shared/' + (index++), scope).href;
      await inbox.put(key, new Response(file, { headers: {
        'content-type': file.type || 'application/octet-stream',
        'x-file-name': encodeURIComponent(file.name || ('shared-' + index)),
        'x-file-modified': String(file.lastModified || Date.now())
      }}));
    }
    return Response.redirect(new URL('./?shared=' + files.length + (files.length > 20 ? '&over=1' : ''), scope).href, 303);
  } catch {
    return Response.redirect(new URL('./?shared=error', scope).href, 303);
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(receiveShare(request));
    return;
  }
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    // 화면과 앱 파일은 같은 버전끼리 맞춘다: 설치된 버전을 먼저 쓰고, 새 버전은 뒤에서 받아 다음 실행 때 바꾼다.
    event.respondWith((async () => {
      const cached = await caches.match(new URL('./', self.registration.scope).href, { cacheName: SHELL });
      if (cached && (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html'))) return cached;
      try { return await fetch(request); }
      catch { return cached || Response.error(); }
    })());
    return;
  }

  // 그 밖의 앱 파일: 저장본 우선, 없으면 받아서 저장.
  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const bucket = url.pathname.includes('/vendor/') ? TOOLS : SHELL;
      (await caches.open(bucket)).put(request, response.clone());
    }
    return response;
  })());
});
