'use strict';
// 브라우저가 주는 영어 오류 문구를 화면에 그대로 띄우지 않는다. 한글 안내가 있으면 그것을, 없으면 대신할 문구를 쓴다.
(() => {
  const REREAD = '사진 파일을 다시 읽지 못했어요. 사진을 지우고 다시 담아주세요.';
  function errText(e, fallback) {
    const name = e && e.name || '', msg = String(e && e.message || '');
    if (name === 'NotReadableError' || name === 'NotFoundError' || /could not be read|permission problems|could not be found|NotReadable/i.test(msg)) return REREAD;
    if (/[가-힣]/.test(msg) && msg.length < 140) return msg;
    return fallback || '처리하지 못했어요. 다시 시도해주세요.';
  }
  // 고른 파일을 앱 메모리로 옮겨 둔다. 안드로이드 사진 선택 화면이 준 파일은 잠시 뒤 읽기 권한이 끊길 수 있다.
  async function keepFile(file) {
    try {
      const buf = await file.arrayBuffer();
      return new File([buf], file.name, { type: file.type, lastModified: file.lastModified || Date.now() });
    } catch (e) {
      const err = new Error('사진 파일을 읽지 못했어요. 휴대폰에 내려받은 사진인지 확인하고 다시 골라주세요.');
      err.name = 'FileReadError';
      throw err;
    }
  }
  window.errText = errText;
  window.keepFile = keepFile;
})();
