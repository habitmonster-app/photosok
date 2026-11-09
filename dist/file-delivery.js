(function () {
  'use strict';

  const MIME = {
    'image/jpeg': { extension: '.jpg', accept: ['.jpg', '.jpeg'], label: 'JPG 사진' },
    'image/png': { extension: '.png', accept: ['.png'], label: 'PNG 사진' },
    'image/webp': { extension: '.webp', accept: ['.webp'], label: 'WebP 사진' },
    'application/pdf': { extension: '.pdf', accept: ['.pdf'], label: 'PDF 문서' },
    'application/zip': { extension: '.zip', accept: ['.zip'], label: 'ZIP 압축 파일' }
  };
  const HISTORY_KEY = '__photoFileDelivery';
  const URL_GRACE_MS = 120000;
  let dialog, elements, current, sequence = 0, nativePending = false;
  let historySettled = Promise.resolve();

  function sanitizeName(value, mime = '') {
    let name = String(value || '사진쏙_파일').normalize('NFC')
      .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
      .replace(/[<>:"/\\|?*]/g, '_').replace(/^[.\s]+|[.\s]+$/g, '');
    if (!name) name = '사진쏙_파일';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
    const type = MIME[mime];
    if (type && !type.accept.some(ext => name.toLowerCase().endsWith(ext))) {
      name = name.replace(/\.[a-z0-9]{1,10}$/i, '') + type.extension;
    }
    const dot = name.lastIndexOf('.');
    const extension = dot > 0 && name.length - dot <= 15 ? name.slice(dot) : '';
    const characters = Array.from(extension ? name.slice(0, dot) : name);
    const encoder = new TextEncoder();
    while (encoder.encode(characters.join('') + extension).byteLength > 180) characters.pop();
    name = characters.join('') + extension;
    return name;
  }

  function validBlob(blob) {
    return blob && typeof blob.size === 'number' && blob.size > 0 &&
      typeof blob.slice === 'function' && typeof blob.arrayBuffer === 'function';
  }

  function shareableFiles(input) {
    const files = Array.from(input || []);
    if (!files.length || files.some(file => !validBlob(file))) return [];
    return files.map((file, index) => new File([file], sanitizeName(file.name || '사진쏙_' + (index + 1), file.type), { type: file.type || 'application/octet-stream' }));
  }

  function supportsShare(files) {
    try {
      return !!(files.length && typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' && navigator.canShare({ files }));
    } catch (_) { return false; }
  }

  async function share(input) {
    let files;
    try { files = shareableFiles(input); } catch (_) { files = []; }
    if (!supportsShare(files)) return { status: 'unsupported', method: 'share', message: '이 브라우저에서는 파일 직접 공유를 지원하지 않아요. 파일을 저장한 뒤 보내주세요.' };
    try {
      // No await before this call: it must retain the button's user activation.
      await navigator.share({ files });
      return { status: 'shared', method: 'share', message: '공유 창으로 파일을 전달했어요.' };
    } catch (error) {
      if (error?.name === 'AbortError') return { status: 'cancelled', method: 'share' };
      return { status: 'failed', method: 'share', message: '공유 창을 열지 못했어요. 파일을 저장한 뒤 보내주세요.' };
    }
  }

  function releaseLater(url) {
    if (url) setTimeout(() => URL.revokeObjectURL(url), URL_GRACE_MS);
  }

  function requestDownload(url, name) {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.rel = 'noopener noreferrer';
    link.hidden = true;
    document.body.append(link);
    try { link.click(); } finally { link.remove(); }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function finishHistory(token) {
    if (!token || history.state?.[HISTORY_KEY] !== token) return Promise.resolve();
    return new Promise(resolve => {
      let timeout;
      const done = () => { clearTimeout(timeout); window.removeEventListener('popstate', done); resolve(); };
      window.addEventListener('popstate', done, { once: true });
      // Never keep the next dialog blocked if a browser suppresses history back.
      timeout = setTimeout(done, 500);
      try { history.back(); } catch (_) { done(); }
    });
  }

  function close(fromHistory = false) {
    const previous = current;
    current = null;
    if (dialog?.open) dialog.close();
    if (!previous) return;
    elements.open.removeAttribute('href');
    releaseLater(previous.url);
    if (!fromHistory) historySettled = finishHistory(previous.historyToken);
    previous.focus?.isConnected && previous.focus.focus?.();
  }

  function ensureDialog() {
    if (dialog) return;
    dialog = element('dialog', 'fd-dialog');
    dialog.id = 'fileDeliveryDialog';
    dialog.setAttribute('aria-labelledby', 'fileDeliveryTitle');
    dialog.setAttribute('aria-describedby', 'fileDeliveryStatus');
    const header = element('div', 'fd-header');
    const title = element('h2', '', '파일 저장 안내'); title.id = 'fileDeliveryTitle';
    const dismiss = element('button', 'fd-close', '×');
    dismiss.type = 'button'; dismiss.setAttribute('aria-label', '저장 안내 닫기');
    dismiss.onclick = () => close(); header.append(title, dismiss);
    const status = element('p', 'fd-status'); status.id = 'fileDeliveryStatus'; status.setAttribute('role', 'status');
    const file = element('p', 'fd-filename');
    const help = element('p', 'fd-help');
    const actions = element('div', 'fd-actions');
    const open = element('a', 'fd-open', '파일 열기');
    open.target = '_blank'; open.rel = 'noopener noreferrer'; open.setAttribute('aria-label', '파일 열기 · 새 탭');
    const retry = element('button', 'fd-retry', '다시 다운로드'); retry.type = 'button';
    const shareButton = element('button', 'fd-share', '공유 · 파일에 저장'); shareButton.type = 'button';
    actions.append(open, retry, shareButton);
    const guidance = element('div', 'fd-guidance');
    const android = element('p', '', 'Android: ‘내 파일 → 다운로드’ 또는 브라우저의 다운로드 목록에서 확인하세요. 사진은 갤러리에 바로 나타나지 않을 수 있어요.');
    const ios = element('p', '', 'iPhone·iPad: 공유 메뉴에서 ‘파일에 저장’을 선택하세요. Safari로 다운로드했다면 ‘파일’ 앱의 다운로드 폴더를 확인하세요.');
    const inapp = element('p', 'fd-inapp', '앱 안의 브라우저에서 저장이 막히면 브라우저 메뉴로 Chrome·Safari에서 이 페이지를 다시 여세요. 그곳에서 사진을 다시 선택해 처리하면 돼요.');
    guidance.append(android, ios, inapp);
    const privacy = element('p', 'fd-privacy', '이 화면에서 파일을 서버로 전송하지 않아요.');
    const done = element('button', 'fd-done', '확인'); done.type = 'button'; done.onclick = () => close();
    dialog.append(header, status, file, help, actions, guidance, privacy, done);
    document.body.append(dialog);
    elements = { title, status, file, help, open, retry, shareButton, android, ios };
    retry.onclick = () => {
      if (!current) return;
      try { requestDownload(current.url, current.name); status.textContent = '다운로드를 다시 요청했어요.'; }
      catch (_) { status.textContent = '다운로드를 시작하지 못했어요. 파일 열기 또는 공유를 이용해주세요.'; }
    };
    shareButton.onclick = async () => {
      if (!current) return;
      const selected = current;
      shareButton.disabled = true;
      const result = await share([new File([selected.blob], selected.name, { type: selected.blob.type })]);
      if (current === selected) {
        shareButton.disabled = false;
        if (result.message) status.textContent = result.message;
        else if (result.status === 'cancelled') status.textContent = '공유를 취소했어요. 다운로드나 파일 열기도 이용할 수 있어요.';
      }
    };
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', () => { if (current) close(); });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close();
    });
    window.addEventListener('popstate', () => {
      if (current?.historyToken && history.state?.[HISTORY_KEY] !== current.historyToken) close(true);
    });
  }

  async function fallback(blob, name, nativeFailed = false) {
    const operation = ++sequence;
    const url = URL.createObjectURL(blob);
    let requested = true;
    try { requestDownload(url, name); } catch (_) { requested = false; }
    await historySettled;
    if (operation !== sequence) { releaseLater(url); return { status: requested ? 'requested' : 'failed', method: 'download', name }; }
    ensureDialog();
    const old = current;
    const token = old?.historyToken || 'fd-' + Date.now() + '-' + operation;
    current = { blob, name, url, historyToken: token, focus: old?.focus || document.activeElement };
    if (old) releaseLater(old.url);
    if (!old) {
      try { history.pushState({ [HISTORY_KEY]: token }, '', location.href); }
      catch (_) { current.historyToken = null; }
    }
    elements.title.textContent = '파일 저장 안내';
    elements.status.textContent = requested ? '다운로드를 요청했어요.' : '다운로드를 시작하지 못했어요.';
    elements.file.textContent = name;
    elements.help.textContent = nativeFailed
      ? '직접 저장을 완료하지 못해 브라우저 다운로드로 전환했어요. 저장 완료 여부는 다운로드 목록에서 확인해주세요.'
      : '이 브라우저에서는 저장 완료 여부를 확인할 수 없어요. 다운로드 목록에서 확인하거나 아래 방법을 이용해주세요.';
    elements.open.href = url;
    elements.shareButton.hidden = !supportsShare(shareableFiles([new File([blob], name, { type: blob.type })]));
    elements.shareButton.disabled = false;
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    elements.android.hidden = ios;
    elements.ios.hidden = /Android/i.test(ua);
    if (!dialog.open) dialog.showModal();
    return { status: requested ? 'requested' : 'failed', method: 'download', name };
  }

  async function save(blob, requestedName) {
    if (!validBlob(blob)) return { status: 'failed', method: 'none', message: '저장할 파일이 없어요. 다시 처리해주세요.' };
    const name = sanitizeName(requestedName, blob.type);
    if (window.PhotoSokApp) {
      // 안드로이드 앱: 갤러리(사진) 또는 다운로드 폴더(PDF·ZIP)에 바로 저장하고 결과를 확인한다.
      try {
        const result = await window.PhotoSokApp.save(blob, name);
        if (result.status === 'saved') return { status: 'saved', method: 'app', name, where: result.where, message: result.where + '에 저장했어요.' };
        return { status: 'failed', method: 'app', name, message: result.message || '저장하지 못했어요. 다시 시도해주세요.' };
      } catch (_) {
        return { status: 'failed', method: 'app', name, message: '저장하지 못했어요. 저장 공간을 확인하고 다시 시도해주세요.' };
      }
    }
    const pickerAvailable = typeof window.showSaveFilePicker === 'function' &&
      window.isSecureContext && (!navigator.userActivation || navigator.userActivation.isActive);
    if (pickerAvailable) {
      if (nativePending) return { status: 'busy', method: 'picker', name, message: '열려 있는 저장 창을 먼저 완료해주세요.' };
      nativePending = true;
      let writable;
      try {
        const type = MIME[blob.type];
        const options = { suggestedName: name };
        if (type) options.types = [{ description: type.label, accept: { [blob.type]: type.accept } }];
        const handle = await window.showSaveFilePicker(options);
        writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close(); writable = null;
        return { status: 'saved', method: 'picker', name };
      } catch (error) {
        if (writable?.abort) { try { await writable.abort(); } catch (_) {} }
        // A user's cancellation must never trigger an unexpected download.
        if (error?.name === 'AbortError') return { status: 'cancelled', method: 'picker', name };
        return await fallback(blob, name, true);
      } finally { nativePending = false; }
    }
    return fallback(blob, name);
  }

  window.FileDelivery = Object.freeze({ save, share, close: () => close(), sanitizeName });
})();
