'use strict';
// 내 스티커: 스티커 만들기로 만든 투명 배경 PNG를 이 기기(IndexedDB)에만 보관한다. 서버로 보내지 않는다.
(() => {
  const DB = 'photosok-stickers', STORE = 'stickers', MAX = 40;
  const cache = new Map(); // id → { url, image }
  let dbP = null;
  function db() {
    if (!dbP) dbP = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }).catch(e => { dbP = null; throw e; });
    return dbP;
  }
  const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(STORE, mode), s = t.objectStore(STORE); const out = fn(s); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); };
  async function load(rec) {
    let c = cache.get(rec.id);
    if (!c) { c = { url: URL.createObjectURL(rec.blob), image: null }; cache.set(rec.id, c); }
    if (!c.image) { try { c.image = await createImageBitmap(rec.blob); } catch (_) {} }
    return c;
  }
  async function list() {
    try {
      const all = await tx('readonly', s => s.getAll());
      const recs = (all || []).sort((a, b) => b.time - a.time);
      const out = [];
      for (const r of recs) { const c = await load(r); out.push({ id: r.id, url: c.url, blob: r.blob }); }
      return out;
    } catch (_) { return []; }
  }
  async function add(blob) {
    const recs = await list();
    if (recs.length >= MAX) throw new Error('내 스티커는 ' + MAX + '개까지 보관할 수 있어요. 안 쓰는 스티커를 지워주세요.');
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await tx('readwrite', s => s.put({ id, blob, time: Date.now() }));
    await load({ id, blob });
    return id;
  }
  async function remove(id) {
    await tx('readwrite', s => s.delete(id));
    const c = cache.get(id); if (c) { URL.revokeObjectURL(c.url); c.image?.close?.(); cache.delete(id); }
  }
  function image(id) { return cache.get(id)?.image || null; }
  // 스티커 목록에 쓰인 내 스티커 그림을 미리 불러 둔다 (그리기는 동기라서)
  async function warm(stickers) {
    const need = (stickers || []).filter(s => s.t === 'img' && !image(s.id));
    if (need.length) await list();
  }
  window.PhotoSokMyStickers = Object.freeze({ list, add, remove, image, warm });
})();
