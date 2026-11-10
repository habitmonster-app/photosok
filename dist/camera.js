'use strict';
// 증명사진 찍기: 카메라 화면 위에 얼굴 윤곽 가이드를 그리고, 얼굴이 가이드에 맞는지 알려준다.
// 찍은 사진은 기기 안에서만 쓰고, 담은 뒤 규격 자동 맞춤이 그대로 적용된다.
// 카메라를 쓸 수 없으면 기본 카메라 앱(파일 선택의 촬영)으로 넘어간다.
// mode 'free' 는 그냥 사진 찍기: 비율·타이머·격자, 여러 장 찍고 "완료"를 누르면 한꺼번에 담는다.
(() => {
  const $ = id => document.getElementById(id);
  let dialog = null, stream = null, facing = 'user', timer = 0, busy = false, last = null;
  let mode = 'id', ratio = '3:4', delay = 0, grid = true, shots = [], toGallery = false, counting = false;
  const RATIOS = { '3:4': [3, 4], '1:1': [1, 1], '9:16': [9, 16], 'full': null };

  function frameSize() {
    if (mode === 'free') {
      const r = RATIOS[ratio], v = $('camVideo');
      if (r) return { w: r[0] * 100, h: r[1] * 100 };
      return v?.videoWidth ? { w: v.videoWidth, h: v.videoHeight } : { w: 300, h: 400 };
    }
    const spec = SPECS[state.spec];
    return spec ? { w: spec.w, h: spec.h } : { w: 354, h: 472 };
  }
  function head() { return (SPECS[state.spec] || SPECS['qnet-half']).head; }

  function build() {
    dialog = document.createElement('dialog');
    dialog.id = 'camDialog'; dialog.className = 'cam-dialog';
    dialog.innerHTML = `
      <div class="cam-head"><h2 id="camTitle">얼굴 맞춰 찍기</h2><button type="button" class="icon-button" id="camClose" aria-label="찍기 닫기"><svg><use href="#i-close"/></svg></button></div>
      <div class="cam-stage" id="camStage"><video id="camVideo" playsinline muted autoplay></video><svg id="camGuide" aria-hidden="true"></svg><p class="cam-status" id="camStatus">카메라를 켜는 중…</p><p class="cam-count" id="camCount" hidden></p><div class="cam-flash" id="camFlash"></div></div>
      <div class="cam-opts" id="camOpts" hidden>
        <div class="cam-chips" role="group" aria-label="비율">${Object.keys(RATIOS).map(k => `<button type="button" data-camratio="${k}">${k === 'full' ? '전체' : k}</button>`).join('')}</div>
        <div class="cam-chips"><button type="button" id="camTimer" aria-label="타이머">타이머 끔</button><button type="button" id="camGridBtn" aria-label="격자">격자</button><button type="button" id="camGallery" aria-label="갤러리에도 저장">갤러리 저장</button></div>
      </div>
      <p class="cam-tip" id="camTip">밝은 곳에서 단색 벽을 뒤에 두고, 정면을 보고 찍으세요. 안경 반사와 그림자를 피하세요.</p>
      <div class="cam-bar"><button type="button" class="icon-button cam-flip" id="camFlip" aria-label="앞뒤 카메라 바꾸기"><svg><use href="#i-convert"/></svg></button><button type="button" class="cam-shutter" id="camShot" aria-label="찍기"></button><span class="cam-spacer" id="camSpacer"></span><button type="button" class="cam-done" id="camDone" hidden><img id="camThumb" alt=""><span>완료</span></button></div>`;
    document.body.append(dialog);
    $('camClose').onclick = () => dialog.close();
    $('camFlip').onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; start(); };
    $('camShot').onclick = () => (mode === 'free' ? shootFree() : shoot());
    $('camDone').onclick = () => dialog.close();
    dialog.querySelectorAll('[data-camratio]').forEach(b => b.onclick = () => { ratio = b.dataset.camratio; drawGuide(); syncOpts(); });
    $('camTimer').onclick = () => { delay = delay === 0 ? 3 : delay === 3 ? 10 : 0; syncOpts(); };
    $('camGridBtn').onclick = () => { grid = !grid; drawGuide(); syncOpts(); };
    $('camGallery').onclick = () => { toGallery = !toGallery; syncOpts(); };
    dialog.addEventListener('close', () => { stop(); if (mode === 'free') flushShots(); });
  }

  function syncOpts() {
    dialog.querySelectorAll('[data-camratio]').forEach(b => { const on = b.dataset.camratio === ratio; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    $('camTimer').textContent = delay ? '타이머 ' + delay + '초' : '타이머 끔'; $('camTimer').classList.toggle('on', !!delay);
    $('camGridBtn').classList.toggle('on', grid); $('camGridBtn').setAttribute('aria-pressed', grid);
    $('camGallery').classList.toggle('on', toGallery); $('camGallery').setAttribute('aria-pressed', toGallery);
  }
  function drawGuide() {
    if (mode === 'free') {
      const { w, h } = frameSize(), g = $('camGuide');
      $('camStage').style.aspectRatio = w + ' / ' + h;
      $('camStage').style.width = `min(100%, calc((100dvh - 300px) * ${(w / h).toFixed(4)}))`;
      g.setAttribute('viewBox', '0 0 300 300'); g.setAttribute('preserveAspectRatio', 'none');
      g.innerHTML = grid ? [100, 200].map(v => `<line x1="${v}" y1="0" x2="${v}" y2="300" stroke="rgba(255,255,255,.45)" stroke-width="1" vector-effect="non-scaling-stroke"/><line x1="0" y1="${v}" x2="300" y2="${v}" stroke="rgba(255,255,255,.45)" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join('') : '';
      return;
    }
    $('camGuide').removeAttribute('preserveAspectRatio'); $('camStage').style.width = '';
    const { w, h } = frameSize(), hd = head();
    const W = 300, H = Math.round(300 * h / w);
    const top = hd.top * H, chin = (hd.top + hd.ratio) * H, ry = (chin - top) / 2, rx = ry * .72, cy = top + ry;
    const sy = chin + ry * .18, sw = W * .48;
    $('camStage').style.aspectRatio = w + ' / ' + h;
    const g = $('camGuide');
    g.setAttribute('viewBox', `0 0 ${W} ${H}`);
    g.innerHTML = `<defs><mask id="camHole"><rect width="${W}" height="${H}" fill="#fff"/><ellipse cx="${W / 2}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000"/></mask></defs>
      <rect width="${W}" height="${H}" fill="rgba(0,0,0,.35)" mask="url(#camHole)"/>
      <ellipse id="camOval" cx="${W / 2}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke-width="3" stroke-dasharray="8 6"/>
      <path id="camShoulder" d="M${W / 2 - sw} ${H} C ${W / 2 - sw} ${sy + 30}, ${W / 2 - rx * 1.1} ${sy + 8}, ${W / 2 - rx * .55} ${sy} M${W / 2 + sw} ${H} C ${W / 2 + sw} ${sy + 30}, ${W / 2 + rx * 1.1} ${sy + 8}, ${W / 2 + rx * .55} ${sy}" fill="none" stroke-width="3" stroke-dasharray="8 6"/>
      <line x1="${W / 2}" y1="0" x2="${W / 2}" y2="${H}" stroke="rgba(255,255,255,.35)" stroke-width="1"/>`;
  }

  function setState(ok, text) {
    $('camStatus').textContent = text;
    $('camStage').classList.toggle('ok', ok === true);
  }

  async function start() {
    stop(false);
    setState(null, '카메라를 켜는 중…');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false });
    } catch (e) {
      setState(false, '카메라를 쓸 수 없어요. 설정에서 카메라 권한을 허용하거나, 기본 카메라로 찍어주세요.');
      return;
    }
    const v = $('camVideo');
    v.srcObject = stream; v.classList.toggle('mirror', facing === 'user');
    try { await v.play(); } catch (_) {}
    if (mode === 'free') { setState(null, ''); $('camStatus').hidden = true; if (ratio === 'full') drawGuide(); return; }
    $('camStatus').hidden = false;
    setState(null, '얼굴을 점선 안에 맞춰주세요');
    window.PhotoSokFace?.preload?.();
    clearInterval(timer); timer = setInterval(check, 700);
  }

  function stop(closeTimer = true) {
    if (closeTimer) clearInterval(timer);
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }

  // 화면에 보이는 영역(가이드 비율)만 잘라 캔버스로
  function grab(maxW) {
    const v = $('camVideo'), vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return null;
    const { w, h } = frameSize(), a = w / h;
    let cw = vw, ch = vh;
    if (vw / vh > a) cw = vh * a; else ch = vw / a;
    const sx = (vw - cw) / 2, sy = (vh - ch) / 2;
    const s = maxW ? Math.min(1, maxW / cw) : 1;
    const c = document.createElement('canvas'); c.width = Math.round(cw * s); c.height = Math.round(ch * s);
    c.getContext('2d').drawImage(v, sx, sy, cw, ch, 0, 0, c.width, c.height);
    return c;
  }

  async function check() {
    if (mode === 'free' || busy || !stream || !dialog.open || !window.PhotoSokFace) return;
    const c = grab(360); if (!c) return;
    busy = true;
    try {
      const r = await PhotoSokFace.detect(c);
      last = r;
      const f = r.faces[0], hd = head();
      if (!f) { setState(false, '얼굴이 안 보여요. 정면을 보고 점선 안에 맞춰주세요'); return; }
      if (r.faces.length > 1) { setState(false, '얼굴이 ' + r.faces.length + '개 보여요. 혼자 찍어주세요'); return; }
      const size = f.chinY - f.crownY, want = hd.ratio;
      const cx = facing === 'user' ? 1 - f.cx : f.cx; // 화면에 보이는 방향 기준
      if (size < want * .85) setState(false, '조금 더 가까이 와주세요');
      else if (size > want * 1.15) setState(false, '조금 뒤로 가주세요');
      else if (cx < .44) setState(false, '오른쪽으로 조금 옮겨주세요');
      else if (cx > .56) setState(false, '왼쪽으로 조금 옮겨주세요');
      else if (f.crownY < hd.top - .06) setState(false, '카메라를 조금 위로 올려주세요');
      else if (f.crownY > hd.top + .06) setState(false, '카메라를 조금 아래로 내려주세요');
      else setState(true, '좋아요. 이대로 찍으세요');
    } catch (_) {
      setState(null, '얼굴을 점선 안에 맞춰주세요');
    } finally { c.width = c.height = 1; busy = false; }
  }

  async function shoot() {
    const v = $('camVideo');
    if (!stream || !v.videoWidth) return;
    // 담을 때는 화면 영역보다 조금 넉넉하게: 전체 프레임을 그대로 담고 자동 맞춤에 맡긴다.
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .95));
    c.width = c.height = 1;
    if (!blob) { toast('사진을 찍지 못했어요. 다시 시도해주세요.', true); return; }
    const d = new Date(), p = n => String(n).padStart(2, '0');
    const name = `사진집사_증명_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`;
    dialog.close();
    await addFiles([new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })]);
    toast('찍은 사진을 담았어요. 얼굴 기준으로 맞춰요.');
  }

  function stamp() { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; }
  async function shootFree() {
    if (!stream || counting) return;
    if (shots.length >= 20) { toast('한 번에 20장까지 찍을 수 있어요. 완료를 눌러 담아주세요.', true); return; }
    if (delay) {
      counting = true; const c = $('camCount'); c.hidden = false;
      for (let n = delay; n > 0; n--) { if (!dialog.open) { counting = false; c.hidden = true; return; } c.textContent = n; await new Promise(r => setTimeout(r, 1000)); }
      c.hidden = true; counting = false;
    }
    const cv = grab(0); if (!cv) return;
    const f = $('camFlash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', .93)); 
    const thumb = cv.toDataURL('image/jpeg', .5); cv.width = cv.height = 1;
    if (!blob) { toast('사진을 찍지 못했어요. 다시 시도해주세요.', true); return; }
    let name = `사진집사_${stamp()}.jpg`; if (shots.some(x => x.name === name)) name = name.replace('.jpg', '_' + (shots.length + 1) + '.jpg');
    const file = new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
    shots.push(file);
    $('camThumb').src = thumb; $('camDone').hidden = false; $('camDone').querySelector('span').textContent = '완료 ' + shots.length;
    if (toGallery) { try { const r = await FileDelivery.save(blob, name); if (r.status === 'failed') toast(r.message || '갤러리에 저장하지 못했어요.', true); } catch (_) {} }
  }
  async function flushShots() {
    const list = shots; shots = [];
    if (!list.length) return;
    await addFiles(list);
    window.PhotoSokScreen?.goWork('사진 찍기');
    toast(list.length + '장을 담았어요.' + (toGallery ? ' 갤러리에도 저장했어요.' : ''));
  }

  function open(opts = {}) {
    mode = opts.mode === 'free' ? 'free' : 'id';
    if (!navigator.mediaDevices?.getUserMedia) { $('capture').click(); return; }
    if (!dialog) build();
    if (mode === 'free') { facing = 'environment'; shots = []; toGallery = document.documentElement.classList.contains('in-app'); }
    else facing = 'user';
    dialog.classList.toggle('free', mode === 'free');
    $('camTitle').textContent = mode === 'free' ? '사진 찍기' : '얼굴 맞춰 찍기';
    $('camOpts').hidden = mode !== 'free';
    $('camTip').textContent = mode === 'free' ? '여러 장 찍은 뒤 완료를 누르면 한꺼번에 담겨요. 사진은 폰 안에서만 써요.' : '밝은 곳에서 단색 벽을 뒤에 두고, 정면을 보고 찍으세요. 안경 반사와 그림자를 피하세요.';
    $('camDone').hidden = true; $('camCount').hidden = true;
    syncOpts(); drawGuide();
    dialog.showModal();
    start();
  }
  // 처음 화면 "사진 찍기": 작업 화면으로 넘어가 찍은 사진을 담는다
  function startFree() { open({ mode: 'free' }); }

  window.PhotoSokCamera = Object.freeze({ open, startFree, _check: check });
})();
