(function () {
  'use strict';

  const MAX_BYTES = 40 * 1024 * 1024;
  const MAX_DECODE_PIXELS = 32000000;
  const MAX_DECODE_EDGE = 10000;
  const MAX_META_BYTES = 2 * 1024 * 1024;
  const baseURL = new URL('.', document.currentScript?.src || location.href);
  const ready = new WeakMap();
  const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);
  const INVALID = 'HEIC 사진을 열 수 없어요. 파일이 손상됐거나 지원하지 않는 HEIC 형식이에요.';
  const TOO_LARGE = '이 HEIC 사진은 너무 커요. 3,200만 화소 이하 사진을 선택해 주세요.';
  const text = (bytes, offset, length) => String.fromCharCode(...bytes.subarray(offset, offset + length));

  function abort(signal) {
    if (signal?.aborted) throw new DOMException('HEIC 변환을 취소했어요.', 'AbortError');
  }

  async function isHeic(file) {
    if (!(file instanceof Blob)) return false;
    const bytes = new Uint8Array(await file.slice(0, 512).arrayBuffer());
    if ((bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
        (bytes[0] === 137 && text(bytes, 1, 3) === 'PNG') ||
        (text(bytes, 0, 4) === 'RIFF' && text(bytes, 8, 4) === 'WEBP')) return false;
    if (text(bytes, 4, 4) === 'ftyp') {
      const brands = [text(bytes, 8, 4)];
      const end = Math.min(new DataView(bytes.buffer).getUint32(0), bytes.length);
      for (let offset = 16; offset + 4 <= end; offset += 4) brands.push(text(bytes, offset, 4));
      if (brands.some(brand => brand === 'avif' || brand === 'avis')) return false;
      if (brands.some(brand => HEIC_BRANDS.has(brand))) return true;
    }
    // A labelled but malformed HEIC should receive the specific HEIC error.
    return /^image\/(heic|heif)(-sequence)?$/i.test(file.type) || /\.hei[cf]$/i.test(file.name || '');
  }

  function dimensionsFromMeta(buffer) {
    const bytes = new Uint8Array(buffer), view = new DataView(buffer);
    const dimensions = [];
    let boxes = 0;
    function walk(start, end, depth) {
      if (depth > 6) throw new Error(INVALID);
      for (let offset = start; offset + 8 <= end;) {
        if (++boxes > 10000) throw new Error(INVALID);
        let size = view.getUint32(offset), header = 8;
        const type = text(bytes, offset + 4, 4);
        if (size === 1) {
          if (offset + 16 > end) throw new Error(INVALID);
          size = view.getUint32(offset + 8) * 4294967296 + view.getUint32(offset + 12);
          header = 16;
        } else if (size === 0) size = end - offset;
        if (!Number.isSafeInteger(size) || size < header || offset + size > end) throw new Error(INVALID);
        const body = offset + header;
        if (type === 'ispe') {
          if (body + 12 > offset + size) throw new Error(INVALID);
          const width = view.getUint32(body + 4), height = view.getUint32(body + 8);
          if (!width || !height) throw new Error(INVALID);
          if (width > MAX_DECODE_EDGE || height > MAX_DECODE_EDGE || width * height > MAX_DECODE_PIXELS) throw new Error(TOO_LARGE);
          dimensions.push({ width, height });
        } else if (type === 'meta' || type === 'iprp' || type === 'ipco') {
          walk(body + (type === 'meta' ? 4 : 0), offset + size, depth + 1);
        }
        offset += size;
      }
    }
    walk(0, bytes.length, 0);
    return dimensions;
  }

  async function preflight(file, signal) {
    // Read top-level headers and bounded metadata only. Skip compressed mdat
    // payloads, including files that place their metadata after the payload.
    for (let offset = 0, count = 0; offset + 8 <= file.size && count < 256; count++) {
      abort(signal);
      const buffer = await file.slice(offset, offset + 16).arrayBuffer();
      abort(signal);
      const bytes = new Uint8Array(buffer), view = new DataView(buffer);
      let size = view.getUint32(0), header = 8;
      if (size === 1) {
        if (buffer.byteLength < 16) throw new Error(INVALID);
        size = view.getUint32(8) * 4294967296 + view.getUint32(12);
        header = 16;
      } else if (size === 0) size = file.size - offset;
      if (!Number.isSafeInteger(size) || size < header || offset + size > file.size) throw new Error(INVALID);
      if (text(bytes, 4, 4) === 'meta') {
        if (size > MAX_META_BYTES) throw new Error('이 HEIC 사진의 정보가 너무 커서 안전하게 열 수 없어요. 다른 사진을 선택해 주세요.');
        const meta = await file.slice(offset, offset + size).arrayBuffer();
        abort(signal);
        const dimensions = dimensionsFromMeta(meta);
        if (!dimensions.length) throw new Error('HEIC 사진 크기를 확인하지 못했어요. 다른 사진을 선택해 주세요.');
        return dimensions;
      }
      offset += size;
    }
    throw new Error(INVALID);
  }

  async function nativeDimensions(file, signal) {
    abort(signal);
    if (typeof createImageBitmap === 'function') {
      try {
        const image = await createImageBitmap(file, { imageOrientation: 'from-image' });
        try { abort(signal); return { width: image.width, height: image.height }; }
        finally { image.close(); }
      } catch (error) { if (error.name === 'AbortError') throw error; }
    }
    abort(signal);
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        const clean = () => { image.onload = null; image.onerror = null; signal?.removeEventListener('abort', cancel); image.src = ''; };
        const cancel = () => { clean(); reject(new DOMException('HEIC 변환을 취소했어요.', 'AbortError')); };
        image.onload = () => { const result = { width: image.naturalWidth, height: image.naturalHeight }; clean(); resolve(result); };
        image.onerror = () => { clean(); resolve(null); };
        signal?.addEventListener('abort', cancel, { once: true });
        image.src = url;
      });
    } finally { URL.revokeObjectURL(url); }
  }

  async function workerConvert(file, signal, progress) {
    if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function') {
      throw new Error('이 브라우저에서는 HEIC 변환을 지원하지 않아요. 최신 브라우저에서 열거나 JPG·PNG 사진을 선택해 주세요.');
    }
    abort(signal);
    return new Promise((resolve, reject) => {
      let worker, timer, settled = false;
      function finish(error, result) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        worker?.terminate();
        if (error) reject(error); else resolve(result);
      }
      const cancel = () => finish(new DOMException('HEIC 변환을 취소했어요.', 'AbortError'));
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        worker = new Worker(new URL('heic-worker.js', baseURL), { type: 'module' });
        worker.onerror = () => finish(new Error('HEIC 변환 도구를 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.'));
        worker.onmessage = event => {
          const data = event.data || {};
          if (data.progress != null) {
            try { progress(data.progress, data.message); } catch (error) { finish(error); }
          } else if (data.error) finish(new Error(data.error));
          else if (data.result) finish(null, data.result);
        };
        timer = setTimeout(() => finish(new Error('HEIC 변환이 오래 걸려 중단했어요. 더 작은 사진으로 다시 시도해 주세요.')), 90000);
        worker.postMessage({ file });
      } catch (error) { finish(new Error('HEIC 변환을 시작하지 못했어요. 다른 브라우저에서 다시 시도해 주세요.')); }
    });
  }

  async function prepare(file, options = {}) {
    const { signal, onProgress } = options;
    const progress = (value, message) => { abort(signal); onProgress?.(value, message); abort(signal); };
    abort(signal);
    if (!(file instanceof Blob) || !file.size) throw new Error('내용이 없는 사진이에요.');
    if (file.size > MAX_BYTES) throw new Error('사진 한 장은 40MB 이하로 선택해 주세요.');
    if (!(await isHeic(file))) { abort(signal); return { file, converted: false, originalFile: file, downsized: false }; }
    if (ready.has(file)) { progress(1, 'HEIC 사진 준비 완료'); return ready.get(file); }
    progress(0.05, 'HEIC 사진을 확인하고 있어요');
    await preflight(file, signal);
    const dimensions = await nativeDimensions(file, signal);
    abort(signal);
    if (dimensions) {
      if (dimensions.width * dimensions.height > MAX_DECODE_PIXELS || Math.max(dimensions.width, dimensions.height) > MAX_DECODE_EDGE) throw new Error(TOO_LARGE);
      const result = { file, converted: false, originalFile: file, ...dimensions, originalWidth: dimensions.width, originalHeight: dimensions.height, downsized: false };
      progress(1, 'HEIC 사진을 바로 열었어요');
      ready.set(file, result);
      return result;
    }
    progress(0.15, 'HEIC 변환 도구를 불러오고 있어요');
    const converted = await workerConvert(file, signal, progress);
    abort(signal);
    if (!(converted.blob instanceof Blob) || converted.blob.type !== 'image/png' || !converted.blob.size || converted.blob.size > MAX_BYTES) throw new Error('HEIC 변환 결과가 너무 커요. 더 작은 사진을 선택해 주세요.');
    const baseName = String(file.name || 'photo.heic').replace(/\.[^.]*$/, '');
    const preparedFile = new File([converted.blob], `${baseName}.png`, { type: 'image/png', lastModified: file.lastModified || Date.now() });
    const result = { file: preparedFile, converted: true, originalFile: file, width: converted.width, height: converted.height, originalWidth: converted.originalWidth, originalHeight: converted.originalHeight, downsized: converted.downsized };
    progress(1, converted.downsized ? 'HEIC 사진을 처리 가능한 크기로 준비했어요' : 'HEIC 사진 준비 완료');
    ready.set(file, result);
    return result;
  }

  window.HeicSupport = Object.freeze({ isHeic, prepare });
})();
