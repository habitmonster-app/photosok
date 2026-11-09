'use strict';
// 안드로이드 앱 안에서만 동작한다(웹 브라우저에서는 아무 일도 하지 않는다).
// 웹 화면이 못 하는 갤러리 저장, 다른 앱으로 보내기, 공유받기를 앱(PhotoSokNative)에 맡긴다.
(() => {
  const bridge = window.PhotoSokNative;
  if (!bridge) return;
  document.documentElement.classList.add('in-app');
  const CHUNK = 768 * 1024; // 3의 배수: 조각마다 base64 패딩이 생기지 않게

  const toBase64 = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  async function upload(blob, name) {
    const id = bridge.begin(name, blob.type || '');
    for (let offset = 0; offset < blob.size; offset += CHUNK) {
      const ok = bridge.append(id, await toBase64(blob.slice(offset, offset + CHUNK)));
      if (!ok) throw new Error('write failed');
      await new Promise(r => setTimeout(r, 0));
    }
    return id;
  }

  async function save(blob, name) {
    const id = await upload(blob, name);
    return JSON.parse(bridge.save(id, blob.type || 'application/octet-stream'));
  }

  async function share(files) {
    const ids = [];
    for (const file of files) ids.push(await upload(file, file.name || '사진쏙_파일'));
    const result = JSON.parse(bridge.share(JSON.stringify(ids)));
    if (result.status !== 'shared') throw new Error(result.message || 'share failed');
  }

  // 화면 코드가 쓰는 navigator.share 를 앱 공유로 연결한다.
  navigator.canShare = data => !!(data && data.files && data.files.length);
  navigator.share = data => share(Array.from(data?.files || []));

  async function receiveShared(over) {
    const list = JSON.parse(bridge.takeShared() || '[]');
    if (!list.length) return;
    const files = [];
    for (const item of list) {
      try {
        const response = await fetch(item.url);
        const blob = await response.blob();
        files.push(new File([blob], item.name, { type: item.type || blob.type, lastModified: Date.now() }));
      } catch (_) {}
    }
    if (!files.length) { window.toast?.('공유받은 파일을 읽지 못했어요. 파일 담기로 다시 골라주세요.', true); return; }
    if (files.some(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) && typeof window.setWorkflow === 'function') window.setWorkflow('pdf');
    await window.addFiles?.(files);
    window.PhotoSokQuick?.open(files);
    if (over) window.toast?.('한 번에 20개까지 받아요. 앞의 20개만 담았어요.', true);
  }

  window.PhotoSokApp = Object.freeze({ save, share, upload, receiveShared: over => receiveShared(over).catch(() => window.toast?.('공유받은 파일을 읽지 못했어요.', true)) });
  window.addEventListener('load', () => window.PhotoSokApp.receiveShared(false));
})();
