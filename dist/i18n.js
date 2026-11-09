'use strict';
// 화면 언어: 한국어(기본) / English. 한국어 문구를 그대로 두고, 영어일 때 화면에 보이는 글자를 바꿔 끼운다.
// 사용자가 만든 내용(파일 이름, 입력한 글씨)은 바꾸지 않는다.
(() => {
  const KEY = 'photosok-lang';
  const EN = window.PhotoSokEN;
  const HANGUL = /[가-힣]/;
  const SKIP = '.filename, #compareName, textarea, input, script, style, .no-i18n';
  const ATTRS = ['aria-label', 'placeholder', 'title', 'alt'];
  const orig = new WeakMap();
  let lang = 'ko';
  try { lang = localStorage.getItem(KEY) || (/^ko/i.test(navigator.language || 'ko') ? 'ko' : 'en'); } catch (_) {}
  if (lang !== 'en') lang = 'ko';

  function tr(text) {
    const lead = text.match(/^\s*/)[0], tail = text.match(/\s*$/)[0];
    const t = text.trim();
    if (!t || !HANGUL.test(t)) return text;
    return lead + core(t) + tail;
  }
  function core(t) {
    if (EN.EXACT[t] != null) return EN.EXACT[t];
    for (const [re, rep] of EN.RULES) {
      const m = t.match(re);
      if (m) return typeof rep === 'function' ? rep(...m) : t.replace(re, rep);
    }
    for (const sep of [' · ', ' → ', '. ']) {
      if (t.includes(sep)) {
        const parts = t.split(sep);
        if (parts.length > 1 && parts.every(Boolean)) return parts.map(p => core(p.trim())).join(sep);
      }
    }
    let out = t;
    for (const [k, v] of EN.PHRASES) out = out.split(k).join(v);
    return out;
  }

  EN.core = core;
  function skip(node) { const el = node.nodeType === 1 ? node : node.parentElement; return !el || !!el.closest(SKIP); }
  function doText(node) {
    if (skip(node)) return;
    const cur = node.nodeValue;
    if (lang === 'en') {
      if (!HANGUL.test(cur)) return;
      orig.set(node, cur);
      const next = tr(cur);
      if (next !== cur) node.nodeValue = next;
    } else if (orig.has(node)) {
      node.nodeValue = orig.get(node); orig.delete(node);
    }
  }
  function doAttrs(el) {
    if (el.closest('script, style, .no-i18n')) return;
    for (const a of ATTRS) {
      const store = 'data-ko-' + a;
      if (lang === 'en') {
        const v = el.getAttribute(a);
        if (v && HANGUL.test(v)) { const next = tr(v); if (next !== v) { el.setAttribute(store, v); el.setAttribute(a, next); } }
      } else if (el.hasAttribute(store)) { el.setAttribute(a, el.getAttribute(store)); el.removeAttribute(store); }
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1) return;
    doAttrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n; while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  let busy = false;
  const mo = new MutationObserver(list => {
    if (busy || lang !== 'en') return;
    busy = true;
    try {
      for (const m of list) {
        if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doAttrs(m.target);
        else m.addedNodes.forEach(walk);
      }
    } finally { busy = false; }
  });

  const titles = { ko: document.title, en: 'PhotoSok · Shrink photos & PDFs on your phone' };
  function apply() {
    document.documentElement.lang = lang;
    document.title = titles[lang];
    busy = true; try { walk(document.body); } finally { busy = false; }
    const name = document.getElementById('pdfName');
    if (name) { if (lang === 'en' && name.value === '제출서류') name.value = 'documents'; else if (lang === 'ko' && name.value === 'documents') name.value = '제출서류'; }
    const btn = document.getElementById('langToggle');
    if (btn) { btn.textContent = lang === 'en' ? '한' : 'EN'; btn.setAttribute('aria-label', lang === 'en' ? '한국어로 보기' : 'View in English'); }
  }
  function set(next) {
    lang = next === 'en' ? 'en' : 'ko';
    try { localStorage.setItem(KEY, lang); } catch (_) {}
    apply();
  }
  function start() {
    const btn = document.getElementById('langToggle');
    if (btn) btn.onclick = () => set(lang === 'en' ? 'ko' : 'en');
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    apply();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.PhotoSokLang = Object.freeze({ get: () => lang, set, t: s => lang === 'en' ? tr(s) : s });
})();
