(function () {
  'use strict';
  const encoder = new TextEncoder();
  const SIZE_ERROR = '사진 크기를 지나치게 줄여야 해요. 전체 용량을 높이거나 사진 수를 줄여 주세요.';
  const abort = signal => { if (signal?.aborted) throw new DOMException('작업을 중단했어요.', 'AbortError'); };
  const decimal = n => Number(n.toFixed(3)).toString();

  async function imageFor(blob, signal) {
    abort(signal);
    if (typeof createImageBitmap === 'function') {
      try {
        const image = await createImageBitmap(blob, { imageOrientation: 'from-image' });
        if (signal?.aborted) { image.close(); abort(signal); }
        return { image, close: () => image.close() };
      } catch (e) { if (e.name === 'AbortError') throw e; }
    }
    const url = URL.createObjectURL(blob);
    try {
      const image = await new Promise((resolve, reject) => {
        const image = new Image();
        const stop = () => { clean(); image.src = ''; reject(new DOMException('작업을 중단했어요.', 'AbortError')); };
        const clean = () => { image.onload = null; image.onerror = null; signal?.removeEventListener('abort', stop); };
        image.onload = () => { clean(); resolve(image); };
        image.onerror = () => { clean(); reject(new Error('사진을 열 수 없어요. 다른 사진을 선택해 주세요.')); };
        signal?.addEventListener('abort', stop, { once: true });
        image.src = url;
      });
      return { image, close: () => { image.src = ''; } };
    } finally { URL.revokeObjectURL(url); }
  }

  async function rotated(file, rotation, signal) {
    if (!rotation) return { file };
    const src = await PhotoEngine.transform(file, { mode: 'convert', format: 'image/jpeg', quality: 0.96, signal });
    const decoded = await imageFor(src.blob, signal);
    const canvas = document.createElement('canvas');
    try {
      const swap = rotation === 90 || rotation === 270;
      canvas.width = swap ? src.height : src.width;
      canvas.height = swap ? src.width : src.height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('사진 회전을 시작할 수 없어요.');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rotation * Math.PI / 180);
      ctx.drawImage(decoded.image, -src.width / 2, -src.height / 2);
      const blob = await new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('사진 회전에 실패했어요.')), 'image/jpeg', 0.96));
      abort(signal);
      return { file: blob, originalWidth: src.originalWidth, originalHeight: src.originalHeight };
    } finally { decoded.close(); canvas.width = 1; canvas.height = 1; }
  }

  function layout(width, height, pageSize) {
    const pageWidth = pageSize === 'a4' ? 595.276 : width / Math.max(width, height) * 841.89;
    const pageHeight = pageSize === 'a4' ? 841.89 : height / Math.max(width, height) * 841.89;
    const margin = pageSize === 'a4' ? 24 : 0;
    const scale = Math.min((pageWidth - margin * 2) / width, (pageHeight - margin * 2) / height);
    const drawWidth = width * scale, drawHeight = height * scale;
    return { pageWidth, pageHeight, drawRect: { x: (pageWidth - drawWidth) / 2, y: (pageHeight - drawHeight) / 2, width: drawWidth, height: drawHeight } };
  }

  async function writePDF(pages, pageSize, signal) {
    const chunks = [], offsets = [0]; let length = 0;
    const append = data => { const bytes = typeof data === 'string' ? encoder.encode(data) : data; chunks.push(bytes); length += bytes.byteLength; };
    const object = (id, body) => { offsets[id] = length; append(`${id} 0 obj\n`); append(body); append('\nendobj\n'); };
    append('%PDF-1.4\n'); append(new Uint8Array([37, 226, 227, 207, 211, 10]));
    object(1, '<< /Type /Catalog /Pages 2 0 R >>');
    object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] >>`);
    for (let i = 0; i < pages.length; i++) {
      abort(signal);
      const p = pages[i], id = 3 + i * 3;
      const l = layout(p.width, p.height, pageSize); Object.assign(p, l);
      const rect = l.drawRect;
      object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${decimal(l.pageWidth)} ${decimal(l.pageHeight)}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`);
      const jpeg = new Uint8Array(await p.blob.arrayBuffer()); abort(signal);
      offsets[id + 1] = length;
      append(`${id + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.byteLength} >>\nstream\n`);
      append(jpeg); append('\nendstream\nendobj\n');
      const stream = `q\n${decimal(rect.width)} 0 0 ${decimal(rect.height)} ${decimal(rect.x)} ${decimal(rect.y)} cm\n/Im0 Do\nQ\n`;
      object(id + 2, `<< /Length ${encoder.encode(stream).byteLength} >>\nstream\n${stream}endstream`);
    }
    const xref = length, count = 3 + pages.length * 3;
    append(`xref\n0 ${count}\n0000000000 65535 f \n`);
    for (let id = 1; id < count; id++) append(String(offsets[id]).padStart(10, '0') + ' 00000 n \n');
    append(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  async function create(input, options = {}) {
    const files = Array.from(input || []), targetBytes = Math.floor(Number(options.targetBytes ?? 2000000));
    const pageSize = options.pageSize ?? 'a4', signal = options.signal;
    if (!files.length || files.length > 20) throw new Error('PDF로 만들 사진을 1~20장 선택해 주세요.');
    if (!Number.isFinite(targetBytes) || targetBytes < 10000 || targetBytes > 200000000) throw new Error('전체 PDF 용량은 10KB~200MB로 설정해 주세요.');
    if (!['a4', 'photo'].includes(pageSize)) throw new Error('PDF 페이지 크기를 확인해 주세요.');
    if (options.rotations != null && (!Array.isArray(options.rotations) || options.rotations.length !== files.length)) throw new Error('사진 회전 정보를 확인해 주세요.');
    const rotations = files.map((_, i) => Number(options.rotations?.[i] ?? 0));
    if (rotations.some(r => ![0, 90, 180, 270].includes(r))) throw new Error('사진은 90도 단위로 회전할 수 있어요.');
    let lastProgress = 0;
    const progress = value => { lastProgress = Math.max(lastProgress, Math.min(1, value)); if (typeof options.onProgress === 'function') options.onProgress(lastProgress); };
    abort(signal); progress(0.01);
    const reserve = 4096 + files.length * 1800;
    const imageBudget = targetBytes - reserve;
    if (imageBudget < files.length * 1024) throw new Error(SIZE_ERROR);
    const pages = [], prepared = [], budgets = files.map(() => Math.floor(imageBudget / files.length));
    const tooSmall = p => Math.max(p.width, p.height) < Math.min(Math.max(p.originalWidth, p.originalHeight), 1200);
    async function compressPage(index, budget, retry = false) {
      const prep = prepared[index];
      const r = await PhotoEngine.compress(prep.file, budget, { stripMetadata: true, signal, onProgress: p => progress(retry ? 0.88 + (index + p) / files.length * 0.08 : 0.03 + (index + p) / files.length * 0.82) });
      return { blob: r.blob, width: r.width, height: r.height, originalWidth: prep.originalWidth || r.originalWidth, originalHeight: prep.originalHeight || r.originalHeight, rotation: rotations[index], metadataRemoved: true };
    }
    for (let i = 0; i < files.length; i++) {
      abort(signal);
      const file = files[i];
      if (!(file instanceof Blob) || !file.size) throw new Error(`${i + 1}번째 사진 파일을 확인해 주세요.`);
      const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
      if (file.type === 'application/pdf' || String.fromCharCode(...head) === '%PDF-') throw new Error('기존 PDF 편집은 아직 지원하지 않아요. PDF로 묶을 사진을 선택해 주세요.');
      prepared.push(await rotated(file, rotations[i], signal));
      pages.push(await compressPage(i, budgets[i]));
    }
    // Give spare bytes from simple pages to detailed pages before refusing a
    // target that would force those pages below the document resolution floor.
    for (let attempt = 0; attempt < 2; attempt++) {
      const failed = pages.map((p, i) => tooSmall(p) ? i : -1).filter(i => i >= 0);
      if (!failed.length) break;
      const spare = imageBudget - pages.reduce((sum, p, i) => sum + (failed.includes(i) ? 0 : p.blob.size), 0);
      const newBudget = Math.floor(spare / failed.length);
      if (failed.every(i => newBudget <= budgets[i] + 512)) break;
      for (const i of failed) { budgets[i] = newBudget; pages[i] = await compressPage(i, newBudget, true); }
    }
    if (pages.some(tooSmall)) throw new Error(SIZE_ERROR);
    abort(signal); progress(0.97);
    const blob = await writePDF(pages, pageSize, signal);
    abort(signal);
    if (blob.size > targetBytes) throw new Error('PDF 전체 용량이 목표를 넘어요. 목표 용량을 조금 높여 주세요.');
    progress(1);
    return { blob, pages, pageCount: pages.length, bytes: blob.size, targetBytes, metadataRemoved: true, pageSize };
  }
  window.PhotoPDF = Object.freeze({ create });
})();
