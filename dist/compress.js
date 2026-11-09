(function () {
  'use strict';

  const MAX_FILE = 40 * 1024 * 1024;
  const MAX_PIXELS = 24 * 1000 * 1000;
  const MAX_EDGE = 8192;
  const OPEN_ERROR = '이 브라우저에서 열 수 없는 사진이에요. JPG·PNG·WebP로 선택해 주세요.';
  const outputTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  function abort(signal) {
    if (signal && signal.aborted) throw new DOMException('작업이 취소됐어요.', 'AbortError');
  }

  async function validate(file) {
    if (!(file instanceof Blob) || !file.size) throw new Error('내용이 없는 파일이에요. 다른 사진을 선택해 주세요.');
    if (file.size > MAX_FILE) throw new Error('사진 한 장은 40MB 이하로 선택해 주세요.');
    const bytes = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
    const ascii = (start, length) => String.fromCharCode(...bytes.slice(start, start + length));
    if (ascii(0, 3) === 'GIF') throw new Error('움직이는 GIF는 지원하지 않아요. JPG·PNG·WebP 사진을 선택해 주세요.');
    const png = bytes[0] === 137 && ascii(1, 3) === 'PNG';
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP';
    const heif = ascii(4, 4) === 'ftyp' && /heic|heix|hevc|hevx|mif1|msf1|avif|avis/.test(ascii(8, 40));
    if (!(png || jpeg || webp || heif)) throw new Error(OPEN_ERROR);
    if (webp && ascii(12, 4) === 'VP8X' && (bytes[20] & 2)) throw new Error('움직이는 WebP는 지원하지 않아요. 정지 사진을 선택해 주세요.');
    if (png) {
      const view = new DataView(bytes.buffer);
      for (let offset = 8; offset + 12 <= bytes.length;) {
        const length = view.getUint32(offset);
        if (ascii(offset + 4, 4) === 'acTL') throw new Error('움직이는 PNG는 지원하지 않아요. 정지 사진을 선택해 주세요.');
        if (ascii(offset + 4, 4) === 'IDAT') break;
        offset += length + 12;
      }
    }
  }

  // Cover layout shared by the engine and the crop editor. crop.x/crop.y
  // (0..1, 0.5 = centre) choose which part of the overflow stays in the
  // frame; crop.zoom (1..4) enlarges beyond the minimum cover scale.
  function coverLayout(orientedWidth, orientedHeight, width, height, crop) {
    const c = normCrop(crop);
    const scale = Math.max(width / orientedWidth, height / orientedHeight) * c.zoom;
    const overflowX = Math.max(0, orientedWidth * scale - width);
    const overflowY = Math.max(0, orientedHeight * scale - height);
    return { scale, overflowX, overflowY, dx: (0.5 - c.x) * overflowX, dy: (0.5 - c.y) * overflowY };
  }
  function normCrop(crop) {
    const n = (v, lo, hi, d) => Number.isFinite(Number(v)) ? clamp(Number(v), lo, hi) : d;
    return { x: n(crop?.x, 0, 1, 0.5), y: n(crop?.y, 0, 1, 0.5), zoom: n(crop?.zoom, 1, 4, 1) };
  }

  async function decode(file, signal) {
    abort(signal);
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        if (signal && signal.aborted) { bitmap.close(); abort(signal); }
        return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
      } catch (error) {
        if (error.name === 'AbortError') throw error;
      }
    }
    abort(signal);
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        const cleanup = () => { img.onload = null; img.onerror = null; if (signal) signal.removeEventListener('abort', cancelled); };
        const cancelled = () => { cleanup(); img.src = ''; reject(new DOMException('작업이 취소됐어요.', 'AbortError')); };
        img.onload = () => { cleanup(); resolve(img); };
        img.onerror = () => { cleanup(); reject(new Error(OPEN_ERROR)); };
        if (signal) signal.addEventListener('abort', cancelled, { once: true });
        img.src = url;
      });
      abort(signal);
      return { image, width: image.naturalWidth, height: image.naturalHeight, close: () => { image.src = ''; } };
    } finally { URL.revokeObjectURL(url); }
  }

  function encode(canvas, mime, quality, signal) {
    abort(signal);
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        try {
          abort(signal);
          if (!blob) throw new Error('사진을 저장할 수 없어요. 더 작은 사진으로 다시 시도해 주세요.');
          if (blob.type !== mime) throw new Error('이 브라우저는 선택한 형식으로 저장할 수 없어요. JPG 또는 PNG를 선택해 주세요.');
          resolve(blob);
        } catch (error) { reject(error); }
      }, mime, quality);
    });
  }

  async function transform(file, options = {}) {
    const { mode = 'compress', signal, onProgress } = options;
    const progress = n => {
      abort(signal);
      if (typeof onProgress === 'function') onProgress(clamp(n, 0, 1));
      abort(signal);
    };
    if (!['compress', 'resize', 'convert'].includes(mode)) throw new Error('작업 종류를 확인해 주세요.');
    const target = Number(options.targetBytes ?? 500000);
    const edge = Number(options.maxEdge ?? 1600);
    const format = mode === 'convert' ? (options.format || 'image/jpeg') : 'image/jpeg';
    const rotation = Number(options.rotation ?? 0);
    if (![0, 90, 180, 270].includes(rotation)) throw new Error('사진 회전은 0°, 90°, 180°, 270° 중에서 선택해 주세요.');
    const stripMetadata = options.stripMetadata === true;
    const exact = options.exactWidth != null || options.exactHeight != null;
    const exactWidth = Number(options.exactWidth), exactHeight = Number(options.exactHeight);
    // 'pad' keeps the whole picture with white margins; 'cover' fills the
    // frame and trims the overflow evenly from the centre (ID photos must
    // not have margins).
    const fitMode = options.fit === 'cover' ? 'cover' : 'pad';
    if (exact && (mode !== 'compress' || !Number.isInteger(exactWidth) || !Number.isInteger(exactHeight) || exactWidth < 100 || exactWidth > 4000 || exactHeight < 100 || exactHeight > 4000 || exactWidth * exactHeight > 16000000)) {
      throw new Error('가로와 세로를 각각 100~4,000픽셀로 입력해 주세요.');
    }
    if (mode === 'compress' && (!Number.isFinite(target) || target < 1024)) throw new Error('목표 용량은 1KB 이상으로 설정해 주세요.');
    if (mode === 'resize' && (!Number.isFinite(edge) || edge < 1 || edge > MAX_EDGE)) throw new Error('사진 크기는 1~8192픽셀로 설정해 주세요.');
    if (!outputTypes.includes(format)) throw new Error('JPG, PNG, WebP 형식 중 하나를 선택해 주세요.');
    const quality = clamp(Number.isFinite(Number(options.quality)) ? Number(options.quality) : 0.9, 0.1, 1);
    abort(signal);
    progress(0.02);
    await validate(file);
    abort(signal);
    const source = await decode(file, signal);
    let canvas;
    try {
      const { width: originalWidth, height: originalHeight } = source;
      if (!originalWidth || !originalHeight) throw new Error(OPEN_ERROR);
      const quarterTurn = rotation === 90 || rotation === 270;
      const orientedWidth = quarterTurn ? originalHeight : originalWidth;
      const orientedHeight = quarterTurn ? originalWidth : originalHeight;
      const result = (blob, width, height, unchanged = false) => ({ blob, width, height, originalWidth, originalHeight, rotation, unchanged, metadataRemoved: !unchanged, mime: blob.type || file.type });
      if (mode === 'compress' && file.size <= target && !stripMetadata && !exact && rotation === 0) {
        progress(1);
        return result(file, originalWidth, originalHeight, true);
      }
      let scale = Math.min(1, MAX_EDGE / Math.max(orientedWidth, orientedHeight), Math.sqrt(MAX_PIXELS / (orientedWidth * orientedHeight)));
      if (mode === 'resize') scale = Math.min(scale, edge / Math.max(orientedWidth, orientedHeight));
      let width = exact ? exactWidth : Math.max(1, Math.floor(orientedWidth * scale));
      let height = exact ? exactHeight : Math.max(1, Math.floor(orientedHeight * scale));
      canvas = document.createElement('canvas');
      function draw() {
        abort(signal);
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: format !== 'image/jpeg' });
        if (!ctx) throw new Error('이 브라우저에서 사진 처리를 시작하지 못했어요.');
        if (format === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        let drawWidth, drawHeight, offsetX = 0, offsetY = 0;
        if (exact) {
          // pad: fit the complete picture into the fixed frame; never stretch,
          // crop, or enlarge the source. White letterboxing fills the rest.
          // cover: scale so the frame is fully covered (never stretched) and
          // let the canvas clip the centred overflow.
          const layout = fitMode === 'cover' ? coverLayout(orientedWidth, orientedHeight, width, height, options.crop) : null;
          const fit = layout ? layout.scale : Math.min(1, width / orientedWidth, height / orientedHeight);
          drawWidth = originalWidth * fit;
          drawHeight = originalHeight * fit;
          if (layout) { offsetX = layout.dx; offsetY = layout.dy; }
        } else {
          drawWidth = quarterTurn ? height : width;
          drawHeight = quarterTurn ? width : height;
        }
        // Rotate the decoded source directly: no lossy intermediate JPEG or
        // second full-size bitmap. Exact frames retain their chosen dimensions.
        ctx.save();
        ctx.translate(width / 2 + offsetX, height / 2 + offsetY);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.drawImage(source.image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        ctx.restore();
      }
      draw();
      progress(0.15);
      if (mode !== 'compress') {
        const blob = await encode(canvas, format, quality, signal);
        progress(1);
        return result(blob, width, height);
      }

      let encodes = 0;
      async function atQuality(percent) {
        abort(signal);
        const blob = await encode(canvas, 'image/jpeg', percent / 100, signal);
        progress(Math.min(0.94, 0.15 + (++encodes) * 0.035));
        // Oversized high-quality encodes can be much larger than the result.
        // Keep their size only; retain just the best feasible output below.
        return { size: blob.size, blob: blob.size <= target ? blob : null };
      }
      for (let round = 0; round < 20; round++) {
        let highCandidate;
        // Keep the one-encode fast path for photos that fit at high quality.
        if (round === 0) {
          highCandidate = await atQuality(96);
          if (highCandidate.blob) { progress(1); return result(highCandidate.blob, width, height); }
        }
        const minimumQuality = exact ? 10 : 50;
        const small = await atQuality(minimumQuality);
        if (small.size <= target) {
          // On later size rounds, a failing minimum skips a needless 96%
          // encode; a feasible minimum is followed by the upper bound.
          highCandidate = highCandidate || await atQuality(96);
          if (highCandidate.blob) { progress(1); return result(highCandidate.blob, width, height); }
          let best = small.blob;
          small.blob = null;
          let low = minimumQuality;
          let high = 96;
          let lowSize = small.size;
          let highSize = highCandidate.size;
          let lastSide = '';
          let sameSide = 0;
          // Search at 1%-quality resolution (native encoders differ). Strictly
          // shrinking exclusive boundaries never revisit a tested percentage,
          // so there is no cache retaining several full output Blobs.
          while (high - low > 1) {
            // Size grows unevenly with JPEG quality. Use the two measured
            // bounds to estimate a closer probe in log-byte space, then keep
            // refining until the feasible and infeasible steps are adjacent.
            // Repeated estimates on one side fall back to a midpoint so a
            // steep or irregular encoder curve cannot cause a long scan.
            let mid = Math.floor((low + high) / 2);
            if (sameSide < 3 && lowSize > 0 && highSize > lowSize) {
              const fraction = Math.log(target / lowSize) / Math.log(highSize / lowSize);
              if (Number.isFinite(fraction)) mid = Math.round(low + (high - low) * fraction);
            } else sameSide = 0;
            mid = clamp(mid, low + 1, high - 1);
            const candidate = await atQuality(mid);
            const side = candidate.blob ? 'low' : 'high';
            if (candidate.blob) { low = mid; lowSize = candidate.size; best = candidate.blob; }
            else { high = mid; highSize = candidate.size; }
            sameSide = side === lastSide ? sameSide + 1 : 1;
            lastSide = side;
          }
          progress(1);
          return result(best, width, height);
        }
        if (exact) throw new Error('지정한 가로·세로를 유지하면 목표 용량을 넘어요. 용량을 높이거나 가로·세로를 줄여 주세요.');
        if (width === 1 && height === 1) break;
        const factor = clamp(Math.sqrt(target / small.size) * 0.92, 0.2, 0.85);
        const nextLong = Math.max(1, Math.floor(Math.max(width, height) * factor));
        // Recompute from the original ratio to avoid accumulating distortion.
        const nextScale = nextLong / Math.max(orientedWidth, orientedHeight);
        width = Math.max(1, Math.round(orientedWidth * nextScale));
        height = Math.max(1, Math.round(orientedHeight * nextScale));
        draw();
      }
      throw new Error('이 용량까지 줄이기 어려워요. 목표 용량을 조금 높여 주세요.');
    } finally {
      source.close();
      if (canvas) { canvas.width = 1; canvas.height = 1; }
    }
  }

  function compress(file, targetBytes, options = {}) {
    return transform(file, { ...options, mode: 'compress', targetBytes });
  }

  function formatBytes(bytes) {
    if (bytes < 1000) return `${bytes} B`;
    if (bytes < 1000000) return `${(bytes / 1000).toFixed(bytes >= 100000 ? 0 : 1)} KB`;
    return `${(bytes / 1000000).toFixed(2)} MB`;
  }

  function downloadName(originalName, result) {
    const name = String(originalName || 'photo').replace(/[\\/\u0000-\u001f]/g, '_');
    const base = name.replace(/\.[^.]*$/, '') || 'photo';
    const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/avif': 'avif' };
    const originalExt = name.includes('.') ? name.split('.').pop() : '';
    const ext = result.unchanged && originalExt ? originalExt : (extensions[result.mime || result.blob?.type] || 'jpg');
    return `${base}_${window.PhotoSokLang?.get() === "en" ? "photosok" : "사진쏙"}.${ext}`;
  }

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  async function zip(files) {
    if (!Array.isArray(files) || !files.length) throw new Error('저장할 사진이 없어요.');
    if (files.length > 65535) throw new Error('한 번에 저장할 사진이 너무 많아요.');
    const chunks = [], central = [], used = new Set();
    let offset = 0, centralSize = 0;
    const encoder = new TextEncoder();
    const date = new Date();
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    const day = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    for (const item of files) {
      if (!(item.blob instanceof Blob)) throw new Error('저장할 사진을 확인해 주세요.');
      let name = String(item.name || 'photo.jpg').replace(/[\\/\u0000-\u001f]/g, '_').replace(/^\.+/, '_');
      const dot = name.lastIndexOf('.'), base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
      for (let index = 2; used.has(name); index++) name = `${base}_${index}${ext}`;
      used.add(name);
      const nameBytes = encoder.encode(name);
      if (nameBytes.length > 65535) throw new Error('파일 이름이 너무 길어요.');
      const data = new Uint8Array(await item.blob.arrayBuffer()), crc = crc32(data);
      if (offset + data.length + nameBytes.length + 30 > 0xffffffff) throw new Error('압축 파일이 너무 커요. 사진을 나누어 저장해 주세요.');
      const local = new Uint8Array(30 + nameBytes.length), l = new DataView(local.buffer);
      l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true);
      l.setUint16(10, time, true); l.setUint16(12, day, true); l.setUint32(14, crc, true);
      l.setUint32(18, data.length, true); l.setUint32(22, data.length, true); l.setUint16(26, nameBytes.length, true);
      local.set(nameBytes, 30); chunks.push(local, data);
      const dir = new Uint8Array(46 + nameBytes.length), d = new DataView(dir.buffer);
      d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x0800, true);
      d.setUint16(12, time, true); d.setUint16(14, day, true); d.setUint32(16, crc, true);
      d.setUint32(20, data.length, true); d.setUint32(24, data.length, true); d.setUint16(28, nameBytes.length, true);
      d.setUint32(42, offset, true); dir.set(nameBytes, 46); central.push(dir);
      centralSize += dir.length; offset += local.length + data.length;
    }
    if (offset + centralSize > 0xffffffff) throw new Error('압축 파일이 너무 커요. 사진을 나누어 저장해 주세요.');
    const end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, centralSize, true); e.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, end], { type: 'application/zip' });
  }

  window.PhotoEngine = Object.freeze({ transform, compress, formatBytes, downloadName, zip, decode, coverLayout });
})();
