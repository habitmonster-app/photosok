(function () {
  'use strict';
  const encoder = new TextEncoder();
  const SIZE_ERROR = '사진 크기를 지나치게 줄여야 해요. 전체 용량을 높이거나 사진 수를 줄여 주세요.';
  const abort = signal => { if (signal?.aborted) throw new DOMException('작업을 중단했어요.', 'AbortError'); };
  const decimal = n => Number(n.toFixed(3)).toString();

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
    const append = data => { const part = typeof data === 'string' ? encoder.encode(data) : data; chunks.push(part); length += part instanceof Blob ? part.size : part.byteLength; };
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
      // Blob parts keep encoded image payloads out of JavaScript byte buffers.
      // Offsets still count the exact JPEG bytes included in the PDF stream.
      const jpeg = p.blob; abort(signal);
      offsets[id + 1] = length;
      append(`${id + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.size} >>\nstream\n`);
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
    const pages = [], budgets = files.map(() => Math.floor(imageBudget / files.length));
    const tooSmall = p => Math.max(p.width, p.height) < Math.min(Math.max(p.originalWidth, p.originalHeight), 1200);
    async function compressPage(index, budget, retry = false) {
      const r = await PhotoEngine.compress(files[index], budget, { rotation: rotations[index], stripMetadata: true, signal, onProgress: p => progress(retry ? 0.88 + (index + p) / files.length * 0.08 : 0.03 + (index + p) / files.length * 0.82) });
      return { blob: r.blob, width: r.width, height: r.height, originalWidth: r.originalWidth, originalHeight: r.originalHeight, rotation: rotations[index], metadataRemoved: true };
    }
    for (let i = 0; i < files.length; i++) {
      abort(signal);
      const file = files[i];
      if (!(file instanceof Blob) || !file.size) throw new Error(`${i + 1}번째 사진 파일을 확인해 주세요.`);
      const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
      if (file.type === 'application/pdf' || String.fromCharCode(...head) === '%PDF-') throw new Error('기존 PDF 편집은 아직 지원하지 않아요. PDF로 묶을 사진을 선택해 주세요.');
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
