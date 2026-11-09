(function () {
  'use strict';
  // All dependencies and document processing stay on this origin/device.
  const base = new URL('.', document.currentScript?.src || location.href);
  const asset = path => new URL(path, base).href;
  const limits = Object.freeze({ pages: 20, fileBytes: 40000000, totalBytes: 200000000 });
  const PASSWORD_ERROR = '암호로 보호된 PDF는 열 수 없어요. 원본 앱에서 암호 보호를 해제한 PDF를 선택해 주세요.';
  const sources = new Map();
  let nextId = 0, libPromise, viewerPromise;
  const abortError = () => new DOMException('작업을 중단했어요.', 'AbortError');
  const abort = signal => { if (signal?.aborted) throw abortError(); };
  const rotation = value => {
    const n = Number(value ?? 0);
    if (![0, 90, 180, 270].includes(n)) throw new Error('페이지는 90도 단위로 회전할 수 있어요.');
    return n;
  };
  function wait(promise, signal, cancel) {
    abort(signal);
    if (!signal) return promise;
    return new Promise((resolve, reject) => {
      const stop = () => { try { cancel?.(); } catch {} reject(abortError()); };
      signal.addEventListener('abort', stop, { once: true });
      promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
    });
  }
  function loadLib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (!libPromise) libPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = asset('vendor/pdf-lib.min.js'); script.async = true;
      script.onload = () => window.PDFLib ? resolve(window.PDFLib) : reject(new Error('PDF 도구를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.'));
      script.onerror = () => { script.remove(); reject(new Error('PDF 도구를 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')); };
      document.head.append(script);
    }).catch(error => { libPromise = null; throw error; });
    return libPromise;
  }
  function loadViewer() {
    if (!viewerPromise) viewerPromise = import(asset('vendor/pdfjs/pdf.mjs')).then(pdfjs => {
      pdfjs.GlobalWorkerOptions.workerSrc = asset('vendor/pdfjs/pdf.worker.mjs');
      return pdfjs;
    }).catch(() => { viewerPromise = null; throw new Error('PDF 미리보기 도구를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.'); });
    return viewerPromise;
  }
  function checkFile(file) {
    if (!(file instanceof Blob) || !file.size) throw new Error('빈 파일은 사용할 수 없어요. 파일을 다시 선택해 주세요.');
    if (file.size > limits.fileBytes) throw new Error('파일 한 개는 40MB 이하로 선택해 주세요.');
  }
  function record(file) {
    checkFile(file);
    let source = sources.get(file);
    if (!source) {
      if ([...sources.keys()].reduce((sum, f) => sum + f.size, file.size) > limits.totalBytes) throw new Error('선택한 원본 파일의 전체 용량은 200MB 이하여야 해요. 필요 없는 파일을 지워 주세요.');
      source = { id: 'pdf-source-' + (++nextId), file, disposed: false, renders: new Set() };
      sources.set(file, source);
    }
    return source;
  }
  function opened(source) { if (source.disposed) throw abortError(); }
  async function libraryDocument(source, signal) {
    abort(signal); opened(source);
    if (!source.library) source.library = (async () => {
      const lib = await loadLib(); opened(source);
      const bytes = new Uint8Array(await source.file.arrayBuffer()); opened(source);
      try {
        const doc = await lib.PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: false, throwOnInvalidObject: true });
        opened(source);
        if (doc.isEncrypted) throw new Error(PASSWORD_ERROR);
        if (doc.getPageCount() < 1 || doc.getPageCount() > limits.pages) throw new Error('PDF 한 개는 1~20페이지까지 열 수 있어요. 필요한 페이지를 나눈 뒤 선택해 주세요.');
        return doc;
      } catch (e) {
        if (e.name === 'AbortError' || e.message === PASSWORD_ERROR || e.message.includes('1~20페이지')) throw e;
        if (e.name === 'EncryptedPDFError' || /encrypted|password/i.test(e.message)) throw new Error(PASSWORD_ERROR);
        throw new Error('PDF를 읽지 못했어요. 파일이 손상되지 않았는지 확인해 주세요.');
      }
    })().catch(error => { source.library = null; throw error; });
    return wait(source.library, signal);
  }
  async function viewerDocument(source, signal) {
    await libraryDocument(source, signal); abort(signal); opened(source);
    if (!source.viewer) source.viewer = (async () => {
      const pdfjs = await loadViewer(); opened(source);
      // PDF.js transfers its input buffer to its worker. Never share this
      // ArrayBuffer with pdf-lib or with another document load.
      const data = new Uint8Array(await source.file.arrayBuffer()); opened(source);
      const task = pdfjs.getDocument({ data, isEvalSupported: false, enableXfa: false,
        cMapUrl: asset('vendor/pdfjs/cmaps/'), cMapPacked: true,
        standardFontDataUrl: asset('vendor/pdfjs/standard_fonts/'), wasmUrl: asset('vendor/pdfjs/wasm/'), iccUrl: asset('vendor/pdfjs/iccs/'),
        canvasMaxAreaInBytes: 32000000, stopAtErrors: true, verbosity: 0 });
      source.loadingTask = task;
      try { const doc = await task.promise; opened(source); return doc; }
      catch (e) { await task.destroy().catch(() => {}); if (e.name === 'PasswordException') throw new Error(PASSWORD_ERROR); throw e; }
    })().catch(error => { source.viewer = null; source.loadingTask = null; throw error; });
    return wait(source.viewer, signal, () => { void dispose(source); });
  }
  async function dispose(source) {
    if (source.disposed) return;
    source.disposed = true;
    if (sources.get(source.file) === source) sources.delete(source.file);
    for (const task of source.renders) task.cancel();
    source.renders.clear();
    const loading = source.loadingTask;
    source.loadingTask = null; source.viewer = null; source.library = null;
    if (loading) await loading.destroy().catch(() => {});
  }
  async function release(file) { const source = sources.get(file); if (source) await dispose(source); }
  async function clear() { await Promise.all([...sources.values()].map(dispose)); }

  async function importFile(file, options = {}) {
    const signal = options.signal; abort(signal); checkFile(file);
    const head = new TextDecoder('latin1').decode(await file.slice(0, 1024).arrayBuffer()); abort(signal);
    if (!/%PDF-\d\.\d/.test(head)) throw new Error('PDF 파일을 선택해 주세요. 사진은 사진 추가로 넣을 수 있어요.');
    const source = record(file);
    try {
      const doc = await libraryDocument(source, signal), pages = doc.getPages().map((page, pageIndex) => {
        const box = page.getCropBox(), turn = ((page.getRotation().angle % 360) + 360) % 360;
        const swap = turn === 90 || turn === 270;
        const descriptor = { sourceType: 'pdf', sourceId: source.id, file, pageIndex,
          width: swap ? box.height : box.width, height: swap ? box.width : box.height, rotation: 0 };
        Object.defineProperty(descriptor, 'id', { value: source.id + '-page-' + pageIndex, enumerable: true });
        return descriptor;
      });
      abort(signal);
      return { file, sourceId: source.id, pageCount: pages.length, pages };
    } catch (e) { await dispose(source); throw e; }
  }
  function descriptor(input) {
    const p = input instanceof Blob ? { file: input, sourceType: 'photo' } : input;
    if (!p || !['photo', 'pdf'].includes(p.sourceType ?? 'photo')) throw new Error('페이지 정보를 확인해 주세요.');
    checkFile(p.file); rotation(p.rotation);
    if (p.sourceType === 'pdf' && (!Number.isInteger(p.pageIndex) || p.pageIndex < 0)) throw new Error('PDF 페이지 번호를 확인해 주세요.');
    return p;
  }
  function selection(input) {
    const pages = Array.from(input || []).map(descriptor);
    if (!pages.length || pages.length > limits.pages) throw new Error('전체 페이지 수는 1~20페이지로 선택해 주세요.');
    const total = [...new Set(pages.map(p => p.file))].reduce((sum, f) => sum + f.size, 0);
    if (total > limits.totalBytes) throw new Error('선택한 원본 파일의 전체 용량은 200MB 이하여야 해요.');
    return pages;
  }
  function encode(canvas, type, quality, signal) {
    abort(signal);
    return wait(new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('페이지 이미지로 변환하지 못했어요.')), type, quality)), signal);
  }
  async function renderPDF(source, pageIndex, options = {}) {
    const signal = options.signal, maxEdge = Math.floor(Number(options.maxEdge ?? 360));
    if (!Number.isFinite(maxEdge) || maxEdge < 64 || maxEdge > 3200) throw new Error('미리보기 크기는 64~3,200픽셀로 설정해 주세요.');
    const doc = await viewerDocument(source, signal); abort(signal);
    if (pageIndex >= doc.numPages) throw new Error('PDF 페이지 번호가 원본 범위를 벗어났어요.');
    const page = await wait(doc.getPage(pageIndex + 1), signal); abort(signal);
    const turn = ((page.rotate + rotation(options.rotation)) % 360 + 360) % 360;
    const original = page.getViewport({ scale: 1, rotation: turn });
    if (!(original.width > 0 && original.height > 0)) throw new Error('PDF 페이지 크기를 읽지 못했어요.');
    const viewport = page.getViewport({ scale: maxEdge / Math.max(original.width, original.height), rotation: turn });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width)); canvas.height = Math.max(1, Math.ceil(viewport.height));
    let task;
    try {
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('이 브라우저에서 PDF 페이지를 그리지 못했어요.');
      task = page.render({ canvasContext: context, canvas, viewport, background: 'rgb(255,255,255)' });
      source.renders.add(task);
      await wait(task.promise, signal, () => task.cancel()); abort(signal);
      const blob = await encode(canvas, options.format === 'image/png' ? 'image/png' : 'image/jpeg', .94, signal); abort(signal);
      return { blob, width: canvas.width, height: canvas.height, originalWidth: canvas.width, originalHeight: canvas.height,
        rotation: rotation(options.rotation), pageWidth: original.width, pageHeight: original.height,
        drawRect: { x: 0, y: 0, width: original.width, height: original.height } };
    } catch (e) { if (signal?.aborted || e.name === 'RenderingCancelledException') throw abortError(); throw e; }
    finally {
      if (task) { await task.promise.catch(() => {}); source.renders.delete(task); }
      canvas.width = canvas.height = 1; page.cleanup();
    }
  }
  async function renderPage(input, options = {}) {
    const p = descriptor(input); abort(options.signal);
    if (p.sourceType === 'pdf') return renderPDF(record(p.file), p.pageIndex, { ...options, rotation: options.rotation ?? p.rotation });
    return PhotoEngine.transform(p.file, { mode: 'resize', maxEdge: options.maxEdge ?? 360,
      rotation: options.rotation ?? p.rotation, stripMetadata: true, signal: options.signal });
  }
  function photoLayout(width, height, pageSize) {
    const pageWidth = pageSize === 'a4' ? 595.276 : width / Math.max(width, height) * 841.89;
    const pageHeight = pageSize === 'a4' ? 841.89 : height / Math.max(width, height) * 841.89;
    const margin = pageSize === 'a4' ? 24 : 0, scale = Math.min((pageWidth - margin * 2) / width, (pageHeight - margin * 2) / height);
    return { pageWidth, pageHeight, drawRect: { x: (pageWidth - width * scale) / 2, y: (pageHeight - height * scale) / 2, width: width * scale, height: height * scale } };
  }
  async function preserve(pages, options, progress) {
    const { signal, pageSize } = options, lib = await wait(loadLib(), signal), output = await lib.PDFDocument.create({ updateMetadata: false });
    const loaded = new Map();
    // Copy all requested pages from each source in one call. This shares font
    // and image objects across its pages instead of duplicating them per page.
    for (const p of pages.filter(p => p.sourceType === 'pdf')) if (!loaded.has(p.file)) {
      const source = await libraryDocument(record(p.file), signal);
      const selected = pages.map((page, index) => ({ page, index })).filter(x => x.page.sourceType === 'pdf' && x.page.file === p.file);
      if (selected.some(x => x.page.pageIndex >= source.getPageCount())) throw new Error('PDF 페이지 번호가 원본 범위를 벗어났어요.');
      const copies = await output.copyPages(source, selected.map(x => x.page.pageIndex)); abort(signal);
      // A repeated source page needs an independent page dictionary so its
      // rotation cannot also change the earlier occurrence.
      const seen = new Set();
      for (let i = 0; i < selected.length; i++) {
        const index = selected[i].page.pageIndex;
        if (seen.has(index)) { [copies[i]] = await output.copyPages(source, [index]); abort(signal); }
        seen.add(index);
      }
      loaded.set(p.file, new Map(selected.map((x, i) => [x.index, copies[i]])));
    }
    for (let i = 0; i < pages.length; i++) {
      abort(signal); const p = pages[i];
      if (p.sourceType === 'pdf') {
        const page = loaded.get(p.file).get(i);
        page.setRotation(lib.degrees(((page.getRotation().angle + rotation(p.rotation)) % 360 + 360) % 360));
        output.addPage(page);
      } else {
        const image = await PhotoEngine.transform(p.file, { mode: 'convert', format: 'image/jpeg', quality: .96, rotation: p.rotation, stripMetadata: true, signal });
        abort(signal); const embedded = await output.embedJpg(await image.blob.arrayBuffer()), box = photoLayout(image.width, image.height, pageSize);
        const page = output.addPage([box.pageWidth, box.pageHeight]); page.drawImage(embedded, box.drawRect);
      }
      progress(.08 + (i + 1) / pages.length * .42);
    }
    abort(signal);
    const bytes = await output.save({ useObjectStreams: true, addDefaultPage: false, objectsPerTick: 30 }); abort(signal);
    if (bytes.byteLength > limits.totalBytes) throw new Error('완성된 PDF가 200MB를 넘어요. 페이지 수를 줄이거나 용량 맞춤을 선택해 주세요.');
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const resultSource = { file: blob, library: Promise.resolve(output), renders: new Set(), disposed: false };
    const previews = [];
    try {
      for (let i = 0; i < pages.length; i++) {
        const preview = await renderPDF(resultSource, i, { maxEdge: 1400, signal });
        previews.push({ ...preview, sourceType: pages[i].sourceType ?? 'photo', rotation: rotation(pages[i].rotation), metadataRemoved: false, textPreserved: pages[i].sourceType === 'pdf' });
        progress(.53 + (i + 1) / pages.length * .45);
      }
    } finally { await dispose(resultSource); }
    return { blob, pages: previews, pageCount: previews.length, bytes: blob.size, targetBytes: null, metadataRemoved: false,
      textPreserved: pages.some(p => p.sourceType === 'pdf'), mode: 'preserve', pageSize };
  }
  async function target(pages, options, progress) {
    const files = [], rotations = []; let intermediateBytes = 0;
    for (let i = 0; i < pages.length; i++) {
      abort(options.signal); const p = pages[i];
      if (p.sourceType === 'pdf') {
        // A lossless intermediate avoids a second JPEG generation before the
        // existing PhotoPDF quality/size search and 1200px resolution guard.
        const image = await renderPDF(record(p.file), p.pageIndex, { maxEdge: 2400, format: 'image/png', rotation: p.rotation, signal: options.signal });
        intermediateBytes += image.blob.size;
        if (intermediateBytes > limits.totalBytes) throw new Error('페이지 이미지가 너무 커요. PDF를 나눠서 처리해 주세요.');
        files.push(new File([image.blob], 'page-' + (i + 1) + '.png', { type: 'image/png' })); rotations.push(0);
      } else { files.push(p.file); rotations.push(rotation(p.rotation)); }
      progress(.03 + (i + 1) / pages.length * .36);
    }
    const result = await PhotoPDF.create(files, { ...options, rotations, onProgress: p => progress(.4 + p * .59) });
    result.pages.forEach((p, i) => { p.sourceType = pages[i].sourceType ?? 'photo'; p.rotation = rotation(pages[i].rotation); p.textPreserved = false; });
    return { ...result, mode: 'target', textPreserved: false };
  }
  async function create(input, options = {}) {
    abort(options.signal);
    const pages = selection(input), mode = options.mode ?? 'target', pageSize = options.pageSize ?? 'a4';
    if (!['preserve', 'target'].includes(mode)) throw new Error('PDF 저장 방식을 확인해 주세요.');
    if (!['a4', 'photo'].includes(pageSize)) throw new Error('PDF 페이지 크기를 확인해 주세요.');
    if (mode === 'target') {
      const bytes = Number(options.targetBytes ?? 2000000);
      if (!Number.isFinite(bytes) || bytes < 10000 || bytes > limits.totalBytes) throw new Error('전체 PDF 용량은 10KB~200MB로 설정해 주세요.');
    }
    let last = 0;
    const progress = value => { last = Math.max(last, Math.min(1, value)); options.onProgress?.(last); };
    progress(.01);
    try {
      const result = await (mode === 'preserve' ? preserve : target)(pages, { ...options, pageSize }, progress);
      abort(options.signal); progress(1); return result;
    } catch (e) {
      if (options.signal?.aborted || e.name === 'AbortError') {
        await Promise.all([...new Set(pages.filter(p => p.sourceType === 'pdf').map(p => p.file))].map(release));
        throw abortError();
      }
      throw e;
    }
  }
  window.PDFTools = Object.freeze({ import: importFile, renderPage, create, release, clear, limits });
})();
