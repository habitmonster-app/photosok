'use strict';
// 공간 확보: 갤러리의 큰 사진을 줄여 바꾸고, 비슷한 사진을 묶어 정리한다. 안드로이드 앱에서만 동작한다.
// - 사진 접근 권한은 이 기능을 쓸 때만 묻는다.
// - 줄인 사진은 원본과 같은 앨범에 새로 넣고(찍은 날짜·사진 정보 유지), 원본은 안드로이드 확인 창을 거쳐 휴지통으로 보낸다.
// - 휴지통 보내기를 취소하면 방금 만든 사본을 지워 사진이 두 벌로 남지 않게 한다.
// - 모든 비교와 처리는 기기 안에서만 한다.
(() => {
  const $ = id => document.getElementById(id);
  const bridge = window.PhotoSokNative;
  const MEDIA = new URL('../media/', document.baseURI).href;
  const trim = s => s.replace(/\.0$/, '');
  const fmt = b => b >= 1e9 ? trim((b / 1e9).toFixed(1)) + 'GB' : b >= 1e6 ? trim((b / 1e6).toFixed(b >= 1e8 ? 0 : 1)) + 'MB' : Math.max(1, Math.round(b / 1e3)) + 'KB';
  const THRESHOLDS = [1e6, 2e6, 4e6];
  const QUALITY = { keep: { edge: 8192, q: .85, label: '화질 그대로에 가깝게' }, small: { edge: 2560, q: .8, label: '더 작게 (긴 변 2,560px)' } };
  const RECENT = 2000;
  let dialog = null, tab = 'big', status = 'unknown', blocked = false;
  const big = { list: null, min: 2e6, quality: 'keep', selected: new Set(), running: false, stop: false };
  const sim = { groups: null, running: false, stop: false, selected: new Set(), sizes: new Map() };
  let trashResolve = null;

  // ---- 앱과 주고받기 ----
  const inApp = () => !!(bridge && typeof bridge.mediaStatus === 'function');
  function refreshStatus() { status = inApp() ? bridge.mediaStatus() : 'web'; }
  function onPermission(s, isBlocked) { status = s; blocked = !!isBlocked; render(); if (s === 'granted' || s === 'partial') load(); }
  function onTrash(ok) { const r = trashResolve; trashResolve = null; if (r) r(!!ok); }
  function askTrash(ids) {
    return new Promise(resolve => {
      trashResolve = resolve;
      if (bridge.trash(JSON.stringify(ids)) !== 'asked') { trashResolve = null; resolve(false); }
    });
  }
  async function getJSON(path) { const r = await fetch(MEDIA + path); if (!r.ok) throw new Error(r.status); return r.json(); }

  // ---- 화면 ----
  function build() {
    dialog = document.createElement('dialog');
    dialog.id = 'cleanDialog'; dialog.className = 'fullsheet';
    dialog.innerHTML = `
      <div class="fs-head"><button type="button" class="icon-button" id="cleanClose" aria-label="공간 확보 닫기"><svg><use href="#i-back"/></svg></button><h2>공간 확보</h2></div>
      <div class="fs-tabs" role="tablist"><button type="button" role="tab" data-ctab="big">큰 사진 줄이기</button><button type="button" role="tab" data-ctab="sim">비슷한 사진</button></div>
      <div class="fs-body" id="cleanBody"></div>
      <div class="fs-bar" id="cleanBar" hidden></div>`;
    document.body.append(dialog);
    $('cleanClose').onclick = () => dialog.close();
    dialog.addEventListener('cancel', e => { if (big.running || sim.running) { e.preventDefault(); big.stop = sim.stop = true; } });
    dialog.querySelectorAll('[data-ctab]').forEach(b => b.onclick = () => { if (big.running || sim.running) return; tab = b.dataset.ctab; render(); load(); });
  }
  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function setBar(html) { const bar = $('cleanBar'); bar.hidden = !html; bar.innerHTML = html || ''; return bar; }

  function render() {
    dialog.querySelectorAll('[data-ctab]').forEach(b => { const on = b.dataset.ctab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    const body = $('cleanBody'); body.replaceChildren(); setBar('');
    if (status === 'web') {
      body.append(el(`<div class="fs-empty"><div class="fs-badge"><svg><use href="#i-image"/></svg></div><h3>안드로이드 앱에서 쓸 수 있어요</h3><p>공간 확보는 휴대폰 갤러리의 사진을 직접 정리하는 기능이라 사진쏙 앱에서만 동작해요.</p></div>`));
      return;
    }
    if (status === 'unsupported') {
      body.append(el(`<div class="fs-empty"><div class="fs-badge"><svg><use href="#i-image"/></svg></div><h3>안드로이드 11 이상에서 쓸 수 있어요</h3><p>원본을 안전하게 휴지통으로 보내는 기능이 안드로이드 11부터 있어서, 이 휴대폰에서는 쓸 수 없어요.</p></div>`));
      return;
    }
    if (status === 'denied' || status === 'unknown') {
      body.append(el(`<div class="fs-empty"><div class="fs-badge"><svg><use href="#i-lock"/></svg></div><h3>사진 접근을 허용해 주세요</h3>
        <p>큰 사진과 비슷한 사진을 찾으려면 갤러리를 살펴봐야 해요. 이 기능에서만 쓰고, 사진은 휴대폰 밖으로 보내지 않아요.</p>
        <ul class="fs-points"><li>바꾸거나 지우기 전에 안드로이드가 꼭 다시 물어봐요.</li><li>원본은 휴지통으로 가서 30일 안에 되살릴 수 있어요.</li></ul>
        <button type="button" class="primary fs-main" id="cleanAllow">${blocked ? '설정에서 허용하기' : '사진 접근 허용하기'}</button></div>`));
      $('cleanAllow').onclick = () => blocked ? bridge.openAppSettings() : bridge.requestMedia();
      return;
    }
    if (status === 'partial') body.append(el(`<p class="fs-note">일부 사진만 허용돼 있어요. 고른 사진 안에서만 찾아요. 전체를 정리하려면 <button type="button" class="link-button" id="cleanMore">설정에서 ‘모두 허용’</button>을 골라주세요.</p>`));
    $('cleanMore')?.addEventListener('click', () => bridge.openAppSettings());
    if (tab === 'big') renderBig(body); else renderSim(body);
  }

  // ---- 큰 사진 줄이기 ----
  const candidates = () => (big.list || []).filter(p => p.mime === 'image/jpeg' && !p.mine && p.size >= big.min);
  function renderBig(body) {
    body.append(el(`<div class="fs-row" role="group" aria-label="찾을 사진 크기">${THRESHOLDS.map(t => `<button type="button" class="chip${t === big.min ? ' on' : ''}" data-min="${t}">${fmt(t)} 넘는 사진</button>`).join('')}</div>`));
    body.append(el(`<div class="fs-row" role="group" aria-label="줄이는 정도">${Object.entries(QUALITY).map(([k, v]) => `<button type="button" class="chip${k === big.quality ? ' on' : ''}" data-q="${k}">${v.label}</button>`).join('')}</div>`));
    body.querySelectorAll('[data-min]').forEach(b => b.onclick = () => { big.min = Number(b.dataset.min); big.selected = new Set(candidates().map(p => p.id)); render(); });
    body.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { big.quality = b.dataset.q; render(); });
    if (!big.list) { body.append(el(`<p class="fs-loading">사진을 살펴보는 중…</p>`)); return; }
    const list = candidates();
    const total = list.reduce((s, p) => s + p.size, 0);
    const skipped = big.list.filter(p => p.size >= big.min && (p.mime !== 'image/jpeg' || p.mine)).length;
    body.append(el(`<div class="fs-summary"><strong>${list.length}장 · ${fmt(total)}</strong><span>${fmt(big.min)} 넘는 JPG 사진${skipped ? ` · HEIC·PNG 등 ${skipped}장은 제외` : ''}</span></div>`));
    if (!list.length) { body.append(el(`<p class="fs-note">줄일 큰 사진이 없어요.</p>`)); return; }
    body.append(el(`<p class="fs-note">찍은 날짜와 사진 정보는 그대로 두고 다시 저장해요. 더 작아지지 않는 사진은 건너뛰어요.</p>`));
    const sel = el(`<div class="fs-selrow"><span id="bigSelCount"></span><button type="button" class="link-button" id="bigSelAll"></button></div>`);
    body.append(sel);
    const grid = el(`<div class="fs-grid"></div>`);
    for (const p of list) {
      const cell = el(`<button type="button" class="fs-cell" data-id="${p.id}"><img loading="lazy" decoding="async" alt="" src="${MEDIA}thumb/${p.id}/200"><span class="fs-size">${fmt(p.size)}</span><span class="fs-check" aria-hidden="true"></span></button>`);
      cell.classList.toggle('on', big.selected.has(p.id));
      cell.onclick = () => { if (big.running) return; big.selected.has(p.id) ? big.selected.delete(p.id) : big.selected.add(p.id); cell.classList.toggle('on', big.selected.has(p.id)); syncBig(); };
      grid.append(cell);
    }
    body.append(grid);
    $('bigSelAll').onclick = () => { const all = list.every(p => big.selected.has(p.id)); big.selected = all ? new Set() : new Set(list.map(p => p.id)); grid.querySelectorAll('.fs-cell').forEach(c => c.classList.toggle('on', big.selected.has(Number(c.dataset.id)))); syncBig(); };
    syncBig();
  }
  function syncBig() {
    const list = candidates().filter(p => big.selected.has(p.id));
    const size = list.reduce((s, p) => s + p.size, 0);
    if ($('bigSelCount')) $('bigSelCount').textContent = list.length + '장 고름 · ' + fmt(size);
    if ($('bigSelAll')) $('bigSelAll').textContent = candidates().every(p => big.selected.has(p.id)) ? '모두 풀기' : '모두 고르기';
    const bar = setBar(`<button type="button" class="primary fs-main" id="bigGo"${list.length ? '' : ' disabled'}>${list.length}장 줄이기</button>`);
    bar.querySelector('#bigGo').onclick = runBig;
  }
  async function runBig() {
    const list = candidates().filter(p => big.selected.has(p.id));
    if (!list.length || big.running) return;
    big.running = true; big.stop = false;
    const q = QUALITY[big.quality];
    const done = []; let before = 0, after = 0, skipped = 0, failed = 0;
    const bar = setBar(`<div class="fs-progress"><progress id="bigProg" max="${list.length}" value="0"></progress><p id="bigProgText"></p><button type="button" class="small-button" id="bigStop">멈추기</button></div>`);
    bar.querySelector('#bigStop').onclick = () => { big.stop = true; };
    for (let i = 0; i < list.length && !big.stop; i++) {
      const p = list[i];
      $('bigProg').value = i; $('bigProgText').textContent = `${i + 1} / ${list.length}장 줄이는 중 · ${fmt(Math.max(0, before - after))} 확보 예정`;
      try {
        const blob = await (await fetch(MEDIA + 'full/' + p.id)).blob();
        const file = new File([blob], p.name || 'photo.jpg', { type: 'image/jpeg' });
        const r = await PhotoEngine.transform(file, { mode: 'resize', maxEdge: q.edge, quality: q.q, stripMetadata: true, format: 'image/jpeg' });
        if (!r?.blob || r.blob.size > blob.size * .8) { skipped++; continue; }
        const up = await PhotoSokApp.upload(r.blob, p.name || 'photo.jpg');
        const saved = JSON.parse(bridge.storeReplacement(up, String(p.id)));
        if (saved.status !== 'saved') { failed++; continue; }
        done.push({ orig: p.id, copy: saved.id, before: blob.size, after: saved.size });
        before += blob.size; after += saved.size;
      } catch (_) { failed++; }
      await new Promise(r => setTimeout(r, 0));
    }
    $('bigProg').value = list.length;
    if (!done.length) { big.running = false; toast(skipped ? '더 작아지는 사진이 없었어요. 바뀐 것은 없어요.' : '사진을 줄이지 못했어요.', !skipped); render(); return; }
    $('bigProgText').textContent = '원본을 휴지통으로 보낼지 안드로이드가 물어봐요.';
    const ok = await askTrash(done.map(d => d.orig));
    big.running = false;
    if (!ok) {
      bridge.deleteOwn(JSON.stringify(done.map(d => d.copy)));
      toast('취소했어요. 원본은 그대로이고, 줄인 사본은 지웠어요.');
      render(); return;
    }
    const freed = before - after;
    try { window.dispatchEvent(new CustomEvent('photosok-cleaned', { detail: { freed } })); recordFreed(freed); } catch (_) {}
    big.list = big.list.filter(p => !done.some(d => d.orig === p.id));
    done.forEach(d => big.selected.delete(d.orig));
    showDone(`${fmt(freed)} 확보했어요`, `${done.length}장을 줄였어요 (${fmt(before)} → ${fmt(after)}).${skipped ? ` ${skipped}장은 더 작아지지 않아 그대로 뒀어요.` : ''}${failed ? ` ${failed}장은 처리하지 못했어요.` : ''} 원본은 휴지통에 30일 동안 있어요.`);
  }
  function recordFreed(freed) {
    try { const k = 'photosok-saved-total'; localStorage.setItem(k, String((Number(localStorage.getItem(k)) || 0) + freed)); window.dispatchEvent(new Event('photosok-saved')); } catch (_) {}
  }
  function showDone(title, text) {
    const body = $('cleanBody'); body.replaceChildren();
    body.append(el(`<div class="fs-empty"><div class="fs-badge ok"><svg><use href="#i-check"/></svg></div><h3>${title}</h3><p>${text}</p></div>`));
    setBar(`<button type="button" class="primary fs-main" id="cleanAgain">계속 정리하기</button>`).querySelector('#cleanAgain').onclick = () => render();
  }

  // ---- 비슷한 사진 ----
  function renderSim(body) {
    if (!sim.groups) {
      body.append(el(`<div class="fs-empty"><div class="fs-badge"><svg><use href="#i-sparkle"/></svg></div><h3>비슷한 사진 찾기</h3><p>최근 사진 ${RECENT.toLocaleString()}장에서 연속 촬영이나 같은 사진을 찾아 묶어요. 가장 선명한 한 장은 남기고 나머지를 고를 수 있어요.</p></div>`));
      setBar(`<button type="button" class="primary fs-main" id="simGo">비슷한 사진 찾기</button>`).querySelector('#simGo').onclick = findSimilar;
      return;
    }
    const groups = sim.groups;
    const extra = groups.reduce((s, g) => s + g.items.length - 1, 0);
    body.append(el(`<div class="fs-summary"><strong>${groups.length}묶음 · ${extra}장</strong><span>최근 ${sim.scanned.toLocaleString()}장에서 찾았어요</span></div>`));
    if (!groups.length) { body.append(el(`<p class="fs-note">비슷한 사진이 없어요.</p>`)); setBar(`<button type="button" class="small-button fs-main" id="simAgain">다시 찾기</button>`).querySelector('#simAgain').onclick = findSimilar; return; }
    body.append(el(`<p class="fs-note">★는 가장 선명해서 남기는 사진이에요. 사진을 눌러 지울지 고를 수 있어요.</p>`));
    for (const g of groups) {
      const d = new Date(g.items[0].date);
      const box = el(`<section class="fs-group"><p class="fs-gtitle">${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} · ${g.items.length}장</p><div class="fs-strip"></div></section>`);
      const strip = box.querySelector('.fs-strip');
      for (const p of g.items) {
        const keep = p.id === g.best;
        const cell = el(`<button type="button" class="fs-cell del" data-id="${p.id}"><img loading="lazy" decoding="async" alt="" src="${MEDIA}thumb/${p.id}/200">${keep ? '<span class="fs-star">★ 남김</span>' : ''}<span class="fs-check" aria-hidden="true"></span></button>`);
        cell.classList.toggle('on', sim.selected.has(p.id));
        cell.onclick = () => { if (sim.running) return; sim.selected.has(p.id) ? sim.selected.delete(p.id) : sim.selected.add(p.id); cell.classList.toggle('on', sim.selected.has(p.id)); syncSim(); };
        strip.append(cell);
      }
      body.append(box);
    }
    syncSim();
  }
  function syncSim() {
    const ids = [...sim.selected];
    const size = ids.reduce((s, id) => s + (sim.sizes.get(id) || 0), 0);
    const bar = setBar(`<button type="button" class="primary fs-main danger" id="simTrash"${ids.length ? '' : ' disabled'}>${ids.length}장 휴지통으로 · ${fmt(size)}</button>`);
    bar.querySelector('#simTrash').onclick = trashSimilar;
  }
  async function trashSimilar() {
    const ids = [...sim.selected]; if (!ids.length) return;
    const size = ids.reduce((s, id) => s + (sim.sizes.get(id) || 0), 0);
    const ok = await askTrash(ids);
    if (!ok) { toast('취소했어요. 지운 사진은 없어요.'); return; }
    recordFreed(size);
    sim.groups = sim.groups.map(g => ({ ...g, items: g.items.filter(p => !sim.selected.has(p.id)) })).filter(g => g.items.length > 1);
    sim.selected.clear();
    showDone(`${fmt(size)} 확보했어요`, `${ids.length}장을 휴지통으로 보냈어요. 30일 안에는 되살릴 수 있어요.`);
  }

  // 작은 썸네일로 사진 지문(dHash 64비트)과 선명도를 구한다.
  const hashCanvas = document.createElement('canvas'); hashCanvas.width = 9; hashCanvas.height = 8;
  const sharpCanvas = document.createElement('canvas'); sharpCanvas.width = 64; sharpCanvas.height = 64;
  function gray(ctx, w, h) { const d = ctx.getImageData(0, 0, w, h).data, g = new Float32Array(w * h); for (let i = 0; i < w * h; i++) g[i] = d[i * 4] * .299 + d[i * 4 + 1] * .587 + d[i * 4 + 2] * .114; return g; }
  async function fingerprint(id) {
    const img = new Image(); img.decoding = 'async'; img.src = MEDIA + 'thumb/' + id + '/96';
    await img.decode();
    const hx = hashCanvas.getContext('2d', { willReadFrequently: true }); hx.drawImage(img, 0, 0, 9, 8);
    const g = gray(hx, 9, 8); let a = 0, b = 0;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const bit = g[y * 9 + x] > g[y * 9 + x + 1] ? 1 : 0, k = y * 8 + x; if (k < 32) a |= bit << k; else b |= bit << (k - 32); }
    const sx = sharpCanvas.getContext('2d', { willReadFrequently: true }); sx.drawImage(img, 0, 0, 64, 64);
    const s = gray(sx, 64, 64); let sum = 0, sum2 = 0, n = 0;
    for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) { const i = y * 64 + x, l = 4 * s[i] - s[i - 1] - s[i + 1] - s[i - 64] - s[i + 64]; sum += l; sum2 += l * l; n++; }
    return { a: a >>> 0, b: b >>> 0, sharp: sum2 / n - (sum / n) ** 2 };
  }
  const pop = v => { v -= (v >>> 1) & 0x55555555; v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };
  const ham = (x, y) => pop(x.a ^ y.a) + pop(x.b ^ y.b);
  async function findSimilar() {
    if (sim.running) return;
    sim.running = true; sim.stop = false;
    const body = $('cleanBody'); body.replaceChildren(el(`<p class="fs-loading" id="simProgText">사진을 불러오는 중…</p>`));
    const bar = setBar(`<div class="fs-progress"><progress id="simProg" max="1" value="0"></progress><button type="button" class="small-button" id="simStop">멈추기</button></div>`);
    bar.querySelector('#simStop').onclick = () => { sim.stop = true; };
    try {
      const list = (await getJSON('list/recent/' + RECENT + '.json')).filter(p => p.w > 0 && p.h > 0);
      $('simProg').max = list.length;
      const prints = [];
      for (let i = 0; i < list.length && !sim.stop; i++) {
        try { prints.push({ ...list[i], ...(await fingerprint(list[i].id)) }); } catch (_) {}
        if (i % 10 === 0) { $('simProg').value = i; $('simProgText').textContent = `${i} / ${list.length}장 비교 중…`; await new Promise(r => setTimeout(r, 0)); }
      }
      // 묶기: 같은 사진(지문 거의 같음) 또는 5분 안에 찍은 비슷한 사진. 가로세로 비율이 다르면 묶지 않는다.
      const parent = prints.map((_, i) => i);
      const find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
      for (let i = 0; i < prints.length; i++) for (let j = i + 1; j < prints.length; j++) {
        const p = prints[i], q = prints[j];
        if (Math.abs(p.w / p.h - q.w / q.h) > .03) continue;
        const d = ham(p, q), near = Math.abs(p.date - q.date) <= 5 * 60e3;
        if (d <= 3 || (near && d <= 10)) parent[find(j)] = find(i);
      }
      const byRoot = new Map();
      prints.forEach((p, i) => { const r = find(i); if (!byRoot.has(r)) byRoot.set(r, []); byRoot.get(r).push(p); });
      const groups = [...byRoot.values()].filter(g => g.length > 1).map(g => {
        const best = [...g].sort((x, y) => y.sharp - x.sharp || y.w * y.h - x.w * x.h || y.size - x.size)[0];
        return { items: g.sort((x, y) => x.date - y.date), best: best.id };
      }).sort((x, y) => y.items[0].date - x.items[0].date);
      sim.sizes = new Map(prints.map(p => [p.id, p.size]));
      sim.selected = new Set(groups.flatMap(g => g.items.filter(p => p.id !== g.best).map(p => p.id)));
      sim.groups = groups; sim.scanned = prints.length;
    } catch (e) { toast('사진을 불러오지 못했어요. 다시 시도해주세요.', true); }
    sim.running = false;
    render();
  }

  // ---- 불러오기 ----
  async function load() {
    if (!(status === 'granted' || status === 'partial')) return;
    if (tab === 'big' && !big.list) {
      try {
        big.list = await getJSON('list/big/' + THRESHOLDS[0] + '.json');
        big.selected = new Set(candidates().map(p => p.id));
      } catch (_) { big.list = []; toast('사진을 불러오지 못했어요.', true); }
      if (dialog.open && tab === 'big') render();
    }
  }
  function open(startTab) {
    if (!dialog) build();
    if (startTab) tab = startTab;
    refreshStatus();
    // 권한을 새로 받았거나 사진이 바뀌었을 수 있으니 열 때마다 다시 살펴본다.
    if (!big.running) big.list = null;
    render();
    dialog.showModal();
    load();
  }
  // 설정 화면에서 돌아오면 권한 상태를 다시 확인한다.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !dialog?.open || !inApp()) return;
    const before = status; refreshStatus();
    if (before !== status) { blocked = false; render(); load(); }
  });

  window.PhotoSokCleanup = Object.freeze({ open, onPermission, onTrash });
})();
