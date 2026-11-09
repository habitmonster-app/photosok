'use strict';
// "공유 한 번으로 끝": 다른 앱에서 사진을 공유받으면 용량만 고르고 바로 줄여서, 다시 보내거나 저장한다.
// 처리는 기존 엔진(사진 → 용량 줄이기)을 그대로 쓴다. 사용자가 누르기 전에는 아무것도 보내지 않는다.
(() => {
  const KEY = 'photosok-quick-target';
  const TARGETS = [[200000, '200KB'], [500000, '500KB'], [1000000, '1MB']];
  const $ = id => document.getElementById(id);
  let dialog, picked = 500000, running = false;
  try { const saved = Number(localStorage.getItem(KEY)); if (TARGETS.some(t => t[0] === saved)) picked = saved; } catch (_) {}

  const fmt = b => b >= 1e6 ? (b / 1e6).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1e3)) + 'KB';
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  function build() {
    dialog = el('dialog', 'quick-sheet'); dialog.id = 'quickSheet'; dialog.setAttribute('aria-labelledby', 'quickTitle');
    dialog.innerHTML = `
      <div class="quick-grab" aria-hidden="true"></div>
      <p class="quick-label" id="quickLabel"></p>
      <h2 id="quickTitle">얼마나 줄일까요?</h2>
      <div class="quick-chips" id="quickChips" role="group" aria-label="목표 용량"></div>
      <div class="quick-result" id="quickResult" hidden><p class="quick-big" id="quickBig"></p><p class="quick-sub" id="quickSub"></p></div>
      <p class="quick-error" id="quickError" role="alert" hidden></p>
      <div class="quick-actions">
        <button type="button" class="primary" id="quickGo" autofocus>줄이기</button>
        <div class="quick-after" id="quickAfter" hidden><button type="button" class="primary" id="quickShare">보내기</button><button type="button" class="small-button" id="quickSave">저장</button></div>
        <button type="button" class="text-button" id="quickMore">자세히 설정하기</button>
      </div>`;
    document.body.append(dialog);
    const chips = $('quickChips');
    for (const [bytes, label] of TARGETS) {
      const b = el('button', 'quick-chip', label); b.type = 'button'; b.dataset.bytes = bytes;
      b.onclick = () => { if (running) return; picked = bytes; try { localStorage.setItem(KEY, String(bytes)); } catch (_) {} paintChips(); reset(); };
      chips.append(b);
    }
    $('quickGo').onclick = run;
    $('quickShare').onclick = async () => { const done = state.items.filter(i => i.result && !i.stale); await sharePhotos(done); };
    $('quickSave').onclick = () => $('saveAll').click();
    $('quickMore').onclick = () => { dialog.close(); document.querySelector('.settings-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    dialog.addEventListener('click', e => { if (e.target === dialog && !running) dialog.close(); });
    dialog.addEventListener('cancel', e => { if (running) e.preventDefault(); });
  }

  function paintChips() {
    dialog.querySelectorAll('.quick-chip').forEach(b => { const on = Number(b.dataset.bytes) === picked; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }
  function reset() {
    $('quickResult').hidden = true; $('quickError').hidden = true; $('quickAfter').hidden = true; $('quickGo').hidden = false;
    $('quickGo').disabled = false; $('quickGo').textContent = fmtTarget() + ' 이하로 줄이기';
  }
  const fmtTarget = () => TARGETS.find(t => t[0] === picked)[1];

  async function run() {
    if (running) return;
    running = true; $('quickGo').disabled = true; $('quickGo').textContent = '줄이는 중…'; $('quickError').hidden = true;
    try {
      if (state.mode !== 'compress') { $('workflowPhoto').click(); document.querySelector('.mode[data-mode="compress"]')?.click(); }
      document.querySelector(`[data-target="${picked}"]`)?.click();
      await $('process').onclick();
      const done = state.items.filter(i => i.result && !i.stale);
      const failed = state.items.filter(i => i.error);
      if (!done.length) throw new Error(failed[0]?.error || '줄이지 못했어요. 자세히 설정하기에서 다른 용량을 골라주세요.');
      const before = [...new Set(done.map(i => i.originalFile || i.file))].reduce((s, f) => s + f.size, 0);
      const after = done.reduce((s, i) => s + i.result.blob.size, 0);
      $('quickBig').innerHTML = `${fmt(before)} → <b>${fmt(after)}</b>`;
      $('quickSub').textContent = `${done.length}장 · 한 장씩 ${fmtTarget()} 이하` + (failed.length ? ` · ${failed.length}장은 실패` : '');
      $('quickResult').hidden = false; $('quickGo').hidden = true; $('quickAfter').hidden = false;
      $('quickShare').hidden = !canShareFiles(done);
      $('quickTitle').textContent = '다 줄였어요';
    } catch (error) {
      $('quickError').textContent = error?.name === 'AbortError' ? '줄이기를 멈췄어요.' : (error?.message || '줄이지 못했어요.');
      $('quickError').hidden = false; $('quickGo').disabled = false; $('quickGo').textContent = '다시 줄이기';
    } finally { running = false; }
  }

  function open(files) {
    const list = Array.from(files || []);
    // PDF가 섞여 있으면 PDF로 모으기 화면으로 간다(빠른 줄이기는 사진만).
    if (!list.length || list.some(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) || typeof state === 'undefined') return;
    if (!dialog) build();
    $('quickTitle').textContent = '얼마나 줄일까요?';
    $('quickLabel').textContent = `공유받은 사진 ${state.items.length}장`;
    paintChips(); reset();
    if (!dialog.open) dialog.showModal();
  }

  window.PhotoSokQuick = Object.freeze({ open });
})();
