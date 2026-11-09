// heic-to is vendored locally. No photo bytes are sent to any server.
import { heicTo } from './vendor/heic-to/heic-to.js';

const MAX_FILE_BYTES = 40 * 1024 * 1024;
const MAX_DECODE_PIXELS = 32000000;
const MAX_OUTPUT_PIXELS = 12000000;
const MAX_OUTPUT_EDGE = 4096;

self.onmessage = async event => {
  let image, canvas;
  try {
    const file = event.data?.file;
    if (!(file instanceof Blob) || !file.size || file.size > MAX_FILE_BYTES) throw new Error('사진 한 장은 40MB 이하로 선택해 주세요.');
    self.postMessage({ progress: 0.3, message: 'HEIC 사진을 이 기기에서 변환하고 있어요' });
    image = await heicTo({ blob: file, type: 'bitmap' });
    const originalWidth = image.width, originalHeight = image.height;
    if (!originalWidth || !originalHeight || originalWidth * originalHeight > MAX_DECODE_PIXELS || Math.max(originalWidth, originalHeight) > 10000) throw new Error('이 HEIC 사진은 너무 커요. 3,200만 화소 이하 사진을 선택해 주세요.');
    let scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(originalWidth, originalHeight), Math.sqrt(MAX_OUTPUT_PIXELS / (originalWidth * originalHeight)));
    let width = Math.max(1, Math.floor(originalWidth * scale));
    let height = Math.max(1, Math.floor(originalHeight * scale));
    canvas = new OffscreenCanvas(width, height);
    let blob;
    for (let pass = 0; pass < 8; pass++) {
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('사진 변환을 시작하지 못했어요.');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, width, height);
      self.postMessage({ progress: Math.min(0.9, 0.65 + pass * 0.03), message: '변환한 사진을 준비하고 있어요' });
      blob = await canvas.convertToBlob({ type: 'image/png' });
      if (blob.size <= MAX_FILE_BYTES) break;
      scale *= Math.min(0.85, Math.sqrt(MAX_FILE_BYTES / blob.size) * 0.9);
      width = Math.max(1, Math.floor(originalWidth * scale));
      height = Math.max(1, Math.floor(originalHeight * scale));
    }
    if (!blob || blob.type !== 'image/png' || blob.size > MAX_FILE_BYTES) throw new Error('HEIC 변환 결과가 너무 커요. 더 작은 사진을 선택해 주세요.');
    self.postMessage({ result: { blob, width, height, originalWidth, originalHeight, downsized: width !== originalWidth || height !== originalHeight } });
  } catch (error) {
    const message = String(error?.message || '');
    self.postMessage({ error: /사진|HEIC 변환 결과/.test(message) ? message : 'HEIC 사진을 변환하지 못했어요. 파일이 손상됐거나 지원하지 않는 HEIC 형식이에요.' });
  } finally {
    image?.close();
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
};
