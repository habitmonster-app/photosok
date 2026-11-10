'use strict';
// 꾸미기: 필터 프리셋(강도 조절) + 비율(잘라 채우기 / 여백·흐린 배경) + 테두리 + 스티커(이모티콘·형광/야광 글씨)를 한 화면에서.
// 원래 사진은 item.decoBase 에 남겨 다시 열면 처음부터 고친다. 글씨가 있으면 꾸민 사진 위에 다시 얹는다.
(() => {
  const $ = id => document.getElementById(id);
  // 모든 값은 강도 100% 기준. exp:노출(스톱) con:대비 sat:채도 warm:색온도 tint:초록↔자홍 fade:검정 들뜸
  // sh/hi: 어두운 곳/밝은 곳 색 더하기 [r,g,b] vig:가장자리 어둡게 grain:입자 bw:흑백 sepia:갈색
  const FILTERS = [
    { id: 'none', name: '원본', group: '기본', p: {} },
    { id: 'vivid', name: '선명하게', group: '기본', p: { con: .18, sat: .28, exp: .05 } },
    { id: 'warm', name: '따뜻하게', group: '기본', p: { warm: .6, sat: .08, exp: .04 } },
    { id: 'cool', name: '차갑게', group: '기본', p: { warm: -.55, sat: -.04 } },
    { id: 'soft', name: '부드럽게', group: '기본', p: { con: -.18, fade: .25, exp: .08, sat: -.08 } },
    { id: 'clear', name: '청량', group: '감성', p: { exp: .18, con: -.15, sat: -.1, fade: .3, sh: [-.01, .03, .03], hi: [-.02, .02, .04], warm: -.2 } },
    { id: 'mint', name: '민트 그늘', group: '감성', p: { exp: .12, con: -.12, sat: -.15, fade: .35, sh: [-.02, .05, .02], tint: .15 } },
    { id: 'cream', name: '크림 화이트', group: '감성', p: { exp: .2, con: -.2, sat: -.3, fade: .3, hi: [.03, .02, -.01], warm: .25 } },
    { id: 'pink', name: '봄날 핑크', group: '감성', p: { exp: .12, con: -.08, sat: -.05, hi: [.04, 0, .02], tint: -.25, fade: .15 } },
    { id: 'cafe', name: '카페', group: '일상', p: { warm: .45, con: .05, sat: -.12, fade: .2, sh: [.02, .01, -.02], vig: .25 } },
    { id: 'food', name: '맛있게', group: '일상', p: { warm: .3, sat: .3, con: .12, exp: .06 } },
    { id: 'golden', name: '노을빛', group: '풍경', p: { warm: .85, sat: .12, hi: [.04, .015, -.03], vig: .2 } },
    { id: 'sky', name: '푸른 하늘', group: '풍경', p: { warm: -.25, sat: .22, con: .1, hi: [-.01, .01, .04] } },
    { id: 'film', name: '필름', group: '필름', p: { con: .08, sat: -.12, fade: .3, sh: [0, .02, .03], hi: [.03, .015, -.02], grain: .5 } },
    { id: 'faded', name: '바랜 필름', group: '필름', p: { con: -.15, sat: -.32, fade: .5, warm: .3, grain: .4, vig: .2 } },
    { id: 'retro', name: '90년대', group: '필름', p: { con: .12, sat: .1, warm: .35, tint: -.1, fade: .2, grain: .6, vig: .25 } },
    { id: 'teal', name: '틸 & 오렌지', group: '시네마', p: { con: .15, sh: [-.03, .02, .05], hi: [.05, .02, -.04], sat: .05, vig: .3 } },
    { id: 'night', name: '밤거리', group: '시네마', p: { con: .2, exp: -.05, sh: [.0, -.01, .05], hi: [.04, -.01, .03], sat: .15, vig: .35 } },
    { id: 'bright', name: '화사하게', group: '기본', p: { exp: .2, con: -.05, sat: .1, fade: .1 } },
    { id: 'matte', name: '매트', group: '기본', p: { con: -.1, fade: .45, sat: -.1 } },
    { id: 'pastel', name: '파스텔', group: '감성', p: { exp: .18, con: -.25, sat: -.2, fade: .35, hi: [.02, .01, .03] } },
    { id: 'lavender', name: '라벤더', group: '감성', p: { exp: .1, con: -.1, tint: -.3, hi: [.02, 0, .04], sat: -.1, fade: .2 } },
    { id: 'peach', name: '복숭아', group: '감성', p: { warm: .3, tint: -.15, exp: .1, con: -.1, hi: [.04, .02, .01], fade: .15 } },
    { id: 'morning', name: '아침 햇살', group: '감성', p: { exp: .22, warm: .2, con: -.12, sat: .05, fade: .2, vig: -.2 } },
    { id: 'rainy', name: '비 오는 날', group: '감성', p: { exp: -.05, warm: -.35, sat: -.35, con: -.05, fade: .25, sh: [0, .02, .04] } },
    { id: 'dessert', name: '디저트', group: '일상', p: { exp: .15, warm: .15, sat: .15, con: -.05, tint: -.08 } },
    { id: 'clean', name: '깔끔한 일상', group: '일상', p: { exp: .12, con: .05, sat: -.05, warm: -.1 } },
    { id: 'pet', name: '반려동물', group: '일상', p: { exp: .1, warm: .25, sat: .12, con: .08, vig: .15 } },
    { id: 'forest', name: '숲', group: '풍경', p: { tint: .25, sat: .15, con: .1, sh: [-.01, .03, .01], warm: -.05 } },
    { id: 'sea', name: '바다', group: '풍경', p: { warm: -.35, sat: .25, con: .12, sh: [-.02, .01, .04], hi: [0, .01, .02] } },
    { id: 'autumn', name: '가을', group: '풍경', p: { warm: .55, sat: .2, tint: -.1, con: .12, sh: [.02, 0, -.02] } },
    { id: 'snow', name: '겨울 눈', group: '풍경', p: { exp: .2, warm: -.4, sat: -.15, con: .05, hi: [-.01, .01, .03] } },
    { id: 'instant', name: '즉석 사진', group: '필름', p: { con: -.08, fade: .35, warm: .25, sat: -.08, hi: [.03, .03, 0], vig: .3, grain: .3 } },
    { id: 'kodak', name: '따뜻한 필름', group: '필름', p: { warm: .5, con: .1, sat: .05, fade: .2, sh: [.02, .01, 0], grain: .45 } },
    { id: 'cinewarm', name: '시네마 웜', group: '시네마', p: { warm: .45, con: .2, sat: -.05, sh: [.01, 0, .02], vig: .35 } },
    { id: 'cinecool', name: '시네마 쿨', group: '시네마', p: { warm: -.45, con: .2, sat: -.1, sh: [0, .01, .04], vig: .35 } },
    { id: 'neon', name: '네온', group: '시네마', p: { con: .25, sat: .35, tint: -.25, sh: [.02, -.02, .06], vig: .3 } },
    { id: 'fadecine', name: '페이드 무비', group: '시네마', p: { con: -.05, sat: -.3, fade: .4, sh: [0, .02, .03], vig: .25 } },
    { id: 'bw', name: '흑백', group: '흑백', p: { bw: 1, con: .1 } },
    { id: 'bwhard', name: '진한 흑백', group: '흑백', p: { bw: 1, con: .4, exp: -.05, vig: .3 } },
    { id: 'bwsoft', name: '부드러운 흑백', group: '흑백', p: { bw: 1, con: -.15, fade: .3 } },
    { id: 'sepia', name: '세피아', group: '흑백', p: { sepia: 1, con: .05, fade: .15, vig: .2 } },
    { id: 'bwcool', name: '푸른 흑백', group: '흑백', p: { bw: 1, con: .15, sh: [0, .01, .04], hi: [0, .005, .02] } },
    { id: 'bwfilm', name: '흑백 필름', group: '흑백', p: { bw: 1, con: .2, fade: .2, grain: .7, vig: .25 } },
    // 효과: clarity 명료도(주변과의 밝기 차 키우기) bloom 글로우(밝은 곳 빛 번짐) leak 빛샘 grit 거친 얼룩
    { id: 'hdr', name: 'HDR', group: '효과', p: { clarity: .9, sat: .14, con: -.06, exp: .03 } },
    { id: 'glow', name: '화사한 글로우', group: '효과', p: { bloom: .75, exp: .08, con: -.08, warm: .1, sat: .05 } },
    { id: 'drama', name: '드라마', group: '효과', p: { clarity: 1.1, sat: -.3, con: .18, vig: .45, exp: -.05 } },
    { id: 'grunge', name: '그런지', group: '효과', p: { clarity: .7, sat: -.35, grit: .9, grain: .6, vig: .35, warm: .15, fade: .1 } },
    { id: 'noir', name: '느와르', group: '효과', p: { bw: 1, con: .5, clarity: .5, vig: .55, exp: -.08 } },
    { id: 'retrolux', name: '레트로룩스', group: '효과', p: { leak: .85, fade: .25, grain: .5, warm: .25, sat: -.05, con: .05, vig: .2 } },
  ];
  // 직접 조절 막대 (-100~100). 필터 위에 더해진다.
  const ADJ = [
    { k: 'exp', name: '밝기', scale: .6 }, { k: 'con', name: '대비', scale: .5 }, { k: 'sat', name: '채도', scale: .6 },
    { k: 'warm', name: '색온도', scale: 1 }, { k: 'tint', name: '색조', scale: .8 }, { k: 'fade', name: '페이드', scale: .7, min: 0 },
    { k: 'sharp', name: '선명도', scale: 1, min: 0 }, { k: 'vig', name: '비네트', scale: .7 }, { k: 'grain', name: '입자', scale: 1, min: 0 },
    { k: 'clarity', name: '명료도', scale: 1 }, { k: 'bloom', name: '글로우', scale: .8, min: 0 },
  ];
  // 조절 아이콘 (선 그림, 24×24)
  const SV = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ADJ_ICON = {
    exp: SV('<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>'),
    con: SV('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor"/>'),
    sat: SV('<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11Z"/>'),
    warm: SV('<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0Z"/><path d="M12 10v6"/>'),
    tint: SV('<circle cx="9" cy="10" r="5"/><circle cx="15" cy="10" r="5"/><circle cx="12" cy="15" r="5"/>'),
    fade: SV('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 9h16M4 14h16" stroke-dasharray="2 2"/>'),
    sharp: SV('<path d="M12 4 20 19H4Z"/>'),
    vig: SV('<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="12" cy="12" r="4"/>'),
    grain: SV('<circle cx="7" cy="7" r="1"/><circle cx="12" cy="9" r="1"/><circle cx="17" cy="6" r="1"/><circle cx="8" cy="13" r="1"/><circle cx="15" cy="14" r="1"/><circle cx="11" cy="18" r="1"/><circle cx="18" cy="18" r="1"/>'),
    clarity: SV('<path d="M12 3 21 12 12 21 3 12Z"/><path d="M12 8v8M8 12h8"/>'),
    bloom: SV('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5" stroke-dasharray="2 3"/><circle cx="12" cy="12" r="9.5" stroke-dasharray="1 4"/>'),
    curve: SV('<path d="M4 20C10 20 9 4 20 4"/><path d="M4 4v16h16" opacity=".4"/>'),
    wb: SV('<path d="M4 18 18 4M14 4h4v4"/><path d="M5 5h4M7 3v4M15 17h4"/>'),
  };
  const TOOLS = [
    { id: 'filter', name: '필터', icon: '<circle cx="9" cy="10" r="5.5"/><circle cx="15" cy="10" r="5.5"/><circle cx="12" cy="15" r="5.5"/>' },
    { id: 'adjust', name: '조절', icon: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>' },
    { id: 'effect', name: '효과', icon: '<path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4Z"/><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z"/>' },
    { id: 'sticker', name: '스티커', icon: '<path d="M5 4h14v9l-6 7H5Z"/><path d="M13 20v-5a2 2 0 0 1 2-2h4"/><circle cx="9.5" cy="9.5" r=".8"/><circle cx="14.5" cy="9.5" r=".8"/>' },
    { id: 'text', name: '글씨', icon: '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>' },
    { id: 'frame', name: '비율', icon: '<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8 3v3M16 18v3M3 10h1M20 14h1"/>' },
  ];
  const MY_KEY = 'photosok-my-filters';
  function myFilters() { try { const a = JSON.parse(localStorage.getItem(MY_KEY) || '[]'); return Array.isArray(a) ? a.slice(0, 30) : []; } catch { return []; } }
  function saveMy(list) { try { localStorage.setItem(MY_KEY, JSON.stringify(list)); return true; } catch { return false; } }
  function findFilter(id) { if (String(id).startsWith('my:')) { const m = myFilters().find(x => 'my:' + x.id === id); return m ? { id, name: m.name, p: m.p } : FILTERS[0]; } return FILTERS.find(x => x.id === id) || FILTERS[0]; }
  const RATIOS = [
    { id: 'orig', name: '원본 비율' },
    { id: '1:1', name: '정사각 1:1', w: 1080, h: 1080 },
    { id: '4:5', name: '세로 4:5', w: 1080, h: 1350 },
    { id: '9:16', name: '스토리 9:16', w: 1080, h: 1920 },
    { id: '1.91:1', name: '가로 1.91:1', w: 1080, h: 566 },
  ];
  const FITS = [{ id: 'cover', name: '꽉 채우기' }, { id: 'white', name: '흰 여백' }, { id: 'black', name: '검정 여백' }, { id: 'blur', name: '흐린 배경' }];
  const DEFAULT = { filter: 'none', strength: 100, ratio: 'orig', fit: 'cover', crop: { x: .5, y: .5, zoom: 1 }, adj: {}, frame: 'none', stickers: [] };
  // 스티커: 위치·크기는 결과 사진에 대한 비율이라 미리보기와 저장 결과가 같다. t:'emoji' 이모티콘, t:'text' 글씨(효과 fx).
  // 스티커 모음: 테마별 이모티콘
  const PACKS = [
    { id: 'heart', name: '하트', items: ['❤️', '💕', '💖', '💘', '💝', '💗', '💓', '💞', '🧡', '💛', '💚', '💙', '💜', '🤍', '🖤', '🫶'] },
    { id: 'face', name: '표정', items: ['😀', '😍', '🥰', '😎', '🤩', '😂', '🥹', '😘', '🥳', '🤗', '😴', '🤔', '😋', '😇', '🙈', '😜'] },
    { id: 'party', name: '축하', items: ['🎉', '🎊', '🎂', '🎁', '🎈', '🥂', '🍾', '👑', '🏆', '✨', '⭐', '🌟', '💯', '🔥', '👍', '👏'] },
    { id: 'cute', name: '귀여움', items: ['🐶', '🐱', '🐰', '🐻', '🐼', '🐥', '🦄', '🐹', '🎀', '🌸', '🌷', '🍀', '🍓', '🧸', '💫', '🌈'] },
    { id: 'trip', name: '여행', items: ['✈️', '🧳', '🗺️', '📸', '🏖️', '🌊', '⛰️', '🏕️', '🚗', '🚂', '🌅', '🗼', '🌴', '☀️', '🌙', '☁️'] },
    { id: 'food', name: '음식', items: ['🍰', '☕', '🍩', '🍕', '🍔', '🍜', '🍣', '🍦', '🍑', '🥐', '🧋', '🍺', '🥗', '🍪', '🍫', '🍉'] },
  ];
  // 그림 스티커 모음: dist/stickers/<모음>/N.webp (사진집사가 받은 원본 그림만 사용)
  const ART = [['love', '러브'], ['animal', '동물'], ['party', '축하'], ['food', '음식'], ['travel', '여행'], ['weather', '날씨'], ['word', '말풍선']]
    .map(([id, name]) => ({ id, name, items: Array.from({ length: 16 }, (_, i) => `stickers/${id}/${i + 1}.webp`) }));
  const artCache = new Map();
  const artImg = src => {
    let im = artCache.get(src);
    if (!im) { im = new Image(); im.decoding = 'async'; im.src = src; artCache.set(src, im); }
    return im.complete && im.naturalWidth ? im : null;
  };
  const warmOne = src => { artImg(src); const im = artCache.get(src); return im.decode ? im.decode().catch(() => {}) : null; };
  const warmArt = list => Promise.all((list || []).filter(s => s.t === 'art').map(s => s.src).map(src => { artImg(src); const im = artCache.get(src); return im.decode ? im.decode().catch(() => {}) : null; }));
  // 라벨 스티커: 누르면 바로 붙는 글씨 꾸밈 (테이프·도장·라벨 모양)
  const LABELS = [
    { text: 'OOTD', fx: 'tape', color: 'pink' }, { text: '오늘의 기록', fx: 'tag', color: 'yellow' }, { text: 'D-DAY', fx: 'badge', color: 'red' },
    { text: 'LOVE', fx: 'neon', color: 'pink' }, { text: 'BEST', fx: 'badge', color: 'navy' }, { text: 'NEW', fx: 'tag', color: 'lime' },
    { text: 'HAPPY', fx: 'tape', color: 'sky' }, { text: '#일상', fx: 'marker', color: 'yellow' }, { text: '맛집 인정', fx: 'bubble', color: 'white' },
    { text: '여행 중', fx: 'tape', color: 'lime' }, { text: 'GOOD', fx: 'glow', color: 'yellow' }, { text: '♥ 소중해', fx: 'tag', color: 'pink' },
  ];
  const TEXT_FX = [{ id: 'plain', name: '기본' }, { id: 'neon', name: '형광' }, { id: 'glow', name: '야광' }, { id: 'marker', name: '형광펜' }, { id: 'outline', name: '외곽선' }, { id: 'bubble', name: '말풍선' }, { id: 'tape', name: '테이프' }, { id: 'tag', name: '라벨' }, { id: 'badge', name: '도장' }];
  const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  const TEXT_FONT = '"Pretendard", Pretendard, -apple-system, "Noto Sans KR", sans-serif';
  function stickerFont(st, px) { return st.t === 'emoji' ? `${px}px ${EMOJI_FONT}` : `800 ${px}px ${TEXT_FONT}`; }
  function stickerBox(ctx, st, w, h) {
    const px = Math.max(6, st.s * Math.min(w, h));
    if (st.t === 'emoji') return { hw: px * .62, hh: px * .62, px };
    if (st.t === 'img' || st.t === 'art') { const im = st.t === 'art' ? artImg(st.src) : window.PhotoSokMyStickers?.image(st.id), a = im ? im.width / im.height : 1; return { hw: (a >= 1 ? px : px * a) / 2, hh: (a >= 1 ? px / a : px) / 2, px, im }; }
    ctx.save(); ctx.font = stickerFont(st, px);
    const lines = String(st.text || '').split('\n');
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width), px);
    ctx.restore();
    if (st.fx === 'badge') { const r = Math.max(widest / 2 + px * .55, lines.length * px * 1.25 / 2 + px * .55); return { hw: r, hh: r, px, lines }; }
    return { hw: widest / 2 + px * .45, hh: lines.length * px * 1.25 / 2 + px * .35, px, lines };
  }
  function drawStickers(ctx, w, h, list, sel = -1) {
    (list || []).forEach((st, i) => {
      const b = stickerBox(ctx, st, w, h), px = b.px;
      ctx.save();
      ctx.translate(st.x * w, st.y * h); ctx.rotate((st.r || 0) * Math.PI / 180);
      ctx.font = stickerFont(st, px); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (st.t === 'emoji') ctx.fillText(st.e, 0, px * .04);
      else if (st.t === 'img' || st.t === 'art') { if (b.im) ctx.drawImage(b.im, -b.hw, -b.hh, b.hw * 2, b.hh * 2); }
      else {
        const color = colorHex(st.color);
        const lh = px * 1.25, ys = b.lines.map((_, k) => -b.lines.length * lh / 2 + lh * (k + .5));
        const dark = hexHsl(color)[2] < 35;
        if (st.fx === 'bubble') {
          const bw = b.hw * 2, bh = b.hh * 2, r = Math.min(bh / 2, px * .6);
          ctx.fillStyle = dark ? '#ffffff' : color; ctx.strokeStyle = '#111111'; ctx.lineWidth = Math.max(2, px * .07);
          ctx.beginPath(); ctx.moveTo(-bw / 2 + r, -bh / 2); ctx.arcTo(bw / 2, -bh / 2, bw / 2, bh / 2, r); ctx.arcTo(bw / 2, bh / 2, -bw / 2, bh / 2, r);
          ctx.lineTo(-bw * .12, bh / 2); ctx.lineTo(-bw * .26, bh / 2 + px * .55); ctx.lineTo(-bw * .3, bh / 2);
          ctx.arcTo(-bw / 2, bh / 2, -bw / 2, -bh / 2, r); ctx.arcTo(-bw / 2, -bh / 2, bw / 2, -bh / 2, r); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = dark ? color : '#111111'; b.lines.forEach((l, k) => ctx.fillText(l, 0, ys[k]));
        } else if (st.fx === 'tape' || st.fx === 'tag' || st.fx === 'badge') {
          const bw = b.hw * 2, bh = b.hh * 2;
          if (st.fx === 'tape') {
            // 마스킹테이프: 반투명 띠, 양 끝은 지그재그
            ctx.save(); ctx.globalAlpha *= .82; ctx.fillStyle = dark ? '#3b3f46' : color; ctx.beginPath();
            const z = px * .18, n = Math.max(3, Math.round(bh / z));
            ctx.moveTo(-bw / 2, -bh / 2); ctx.lineTo(bw / 2, -bh / 2);
            for (let k = 1; k <= n; k++) ctx.lineTo(bw / 2 + (k % 2 ? -z * .7 : 0), -bh / 2 + bh * k / n);
            ctx.lineTo(-bw / 2, bh / 2);
            for (let k = n - 1; k >= 0; k--) ctx.lineTo(-bw / 2 + (k % 2 ? z * .7 : 0), -bh / 2 + bh * k / n);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.25)'; for (let k = -bw / 2; k < bw / 2; k += px * .5) ctx.fillRect(k, -bh / 2, px * .12, bh);
            ctx.restore();
            ctx.fillStyle = dark ? '#ffffff' : '#222222';
          } else if (st.fx === 'tag') {
            // 라벨: 왼쪽이 뾰족한 이름표 + 구멍
            const r = px * .2;
            ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-bw / 2 - px * .35, 0); ctx.lineTo(-bw / 2 + px * .1, -bh / 2);
            ctx.arcTo(bw / 2, -bh / 2, bw / 2, bh / 2, r); ctx.arcTo(bw / 2, bh / 2, -bw / 2, bh / 2, r); ctx.lineTo(-bw / 2 + px * .1, bh / 2); ctx.closePath();
            ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = px * .2; ctx.shadowOffsetY = px * .06; ctx.fill(); ctx.shadowColor = 'transparent';
            ctx.globalCompositeOperation = 'destination-out'; ctx.beginPath(); ctx.arc(-bw / 2 + px * .08, 0, px * .1, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = dark ? '#ffffff' : '#111111';
          } else {
            // 도장: 겹 원 테두리, 살짝 바랜 잉크
            const r = b.hw; ctx.save(); ctx.globalAlpha *= .9; ctx.strokeStyle = color; ctx.fillStyle = color;
            ctx.lineWidth = Math.max(2, px * .12); ctx.beginPath(); ctx.arc(0, 0, r - ctx.lineWidth / 2, 0, 7); ctx.stroke();
            ctx.lineWidth = Math.max(1, px * .05); ctx.beginPath(); ctx.arc(0, 0, r - px * .3, 0, 7); ctx.stroke();
            ctx.restore(); ctx.fillStyle = color;
          }
          b.lines.forEach((l, k) => ctx.fillText(l, 0, ys[k]));
        } else if (st.fx === 'outline') {
          ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, px * .22); ctx.strokeStyle = dark ? '#ffffff' : '#111111';
          b.lines.forEach((l, k) => ctx.strokeText(l, 0, ys[k])); ctx.fillStyle = color; b.lines.forEach((l, k) => ctx.fillText(l, 0, ys[k]));
        } else if (T && ['neon', 'glow', 'marker'].includes(st.fx)) T.fx(ctx, b.lines, 0, ys, px, color, st.fx);
        else { ctx.shadowColor = dark ? 'rgba(255,255,255,.8)' : 'rgba(0,0,0,.55)'; ctx.shadowBlur = px * .25; ctx.fillStyle = color; b.lines.forEach((l, k) => ctx.fillText(l, 0, ys[k])); }
      }
      if (i === sel) {
        ctx.shadowBlur = 0; ctx.setLineDash([6, 5]); ctx.lineWidth = 2; ctx.strokeStyle = '#c8f04a';
        ctx.strokeRect(-b.hw, -b.hh, b.hw * 2, b.hh * 2);
      }
      ctx.restore();
    });
  }
  function hitSticker(ctx, list, w, h, x, y) {
    for (let i = (list || []).length - 1; i >= 0; i--) {
      const st = list[i], b = stickerBox(ctx, st, w, h), a = -(st.r || 0) * Math.PI / 180;
      const dx = x - st.x * w, dy = y - st.y * h, rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
      if (Math.abs(rx) <= b.hw && Math.abs(ry) <= b.hh) return i;
    }
    return -1;
  }
  let dialog, canvas, session = null, pending = false;

  function params(id, strength, adj = {}, curve = null) {
    const f = findFilter(id);
    const s = strength / 100, p = f.p, a = k => { const d = ADJ.find(x => x.k === k); return d ? (Number(adj[k]) || 0) / 100 * d.scale : 0; };
    const v = k => (p[k] || 0) * s + a(k);
    const tint = t => (t || [0, 0, 0]).map(n => n * s);
    return { exp: v('exp'), con: v('con'), sat: v('sat'), warm: v('warm'), tint: v('tint'), fade: Math.max(0, v('fade')), vig: v('vig'), grain: Math.max(0, v('grain')),
      sharp: Math.max(0, v('sharp')), clarity: v('clarity'), bloom: Math.max(0, v('bloom')), leak: Math.max(0, v('leak')), grit: Math.max(0, v('grit')), curve: curveLut(curve), bw: Math.min(1, (p.bw || 0) * s), sepia: Math.min(1, (p.sepia || 0) * s), sh: tint(p.sh), hi: tint(p.hi) };
  }

  function boxBlur(src, w, h, r, tmp, out) {
    const dd = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const o = y * w; let s = 0;
      for (let k = -r; k <= r; k++) s += src[o + Math.min(w - 1, Math.max(0, k))];
      for (let x = 0; x < w; x++) { tmp[o + x] = s / dd; s += src[o + Math.min(w - 1, x + r + 1)] - src[o + Math.max(0, x - r)]; }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
      for (let y = 0; y < h; y++) { out[y * w + x] = s / dd; s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
    }
    return out;
  }
  // 커브: 0, ¼, ½, ¾, 1 다섯 점의 높이로 매끄러운(단조) 곡선을 만들어 0~255 표로 바꾼다.
  const CURVE_X = [0, .25, .5, .75, 1];
  function isFlat(c) { return !Array.isArray(c) || c.length !== 5 || c.every((v, i) => Math.abs(v - CURVE_X[i]) < .004); }
  function curveFn(c) {
    const n = 5, dx = .25, m = [], t = [];
    for (let i = 0; i < n - 1; i++) m.push((c[i + 1] - c[i]) / dx);
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) { if (!m[i]) { t[i] = t[i + 1] = 0; continue; } const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b; if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; } }
    return x => {
      const i = Math.min(n - 2, Math.max(0, Math.floor(x / dx))), u = (x - CURVE_X[i]) / dx, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * c[i] + (u3 - 2 * u2 + u) * dx * t[i] + (-2 * u3 + 3 * u2) * c[i + 1] + (u3 - u2) * dx * t[i + 1];
    };
  }
  function curveLut(c) {
    if (isFlat(c)) return null;
    const f = curveFn(c), lut = new Float32Array(256);
    for (let i = 0; i < 256; i++) lut[i] = Math.min(1, Math.max(0, f(i / 255)));
    return lut;
  }

  // 픽셀 단위 색 보정 (미리보기와 저장 결과가 같은 식을 쓴다)
  function grade(ctx, w, h, q) {
    if (!['exp', 'con', 'sat', 'warm', 'tint', 'fade', 'vig', 'grain', 'bw', 'sepia', 'sharp', 'clarity', 'bloom', 'leak', 'grit', 'curve'].some(k => q[k]) && !q.sh.some(Boolean) && !q.hi.some(Boolean)) return;
    const img = ctx.getImageData(0, 0, w, h), d = img.data;
    // 명료도·글로우용 흐린 밝기 지도 (원래 사진 기준)
    let L0 = null, Lb = null, Bb = null;
    if (q.clarity || q.bloom) {
      const n = w * h, T = new Float32Array(n); L0 = new Float32Array(n);
      for (let i = 0, j = 0; i < n; i++, j += 4) L0[i] = (.299 * d[j] + .587 * d[j + 1] + .114 * d[j + 2]) / 255;
      if (q.clarity) { Lb = new Float32Array(n); boxBlur(L0, w, h, Math.max(2, Math.round(Math.max(w, h) / 80)), T, Lb); }
      if (q.bloom) {
        const B = new Float32Array(n); for (let i = 0; i < n; i++) B[i] = Math.max(0, L0[i] - .5) / .5;
        const r = Math.max(2, Math.round(Math.max(w, h) / 30)), B2 = new Float32Array(n);
        boxBlur(B, w, h, r, T, B2); boxBlur(B2, w, h, r, T, B); Bb = B;
      }
    }
    // 그런지 얼룩: 굵은 격자 잡음을 부드럽게 이어 붙인다
    let grit = null, gcell = 1, gw = 0;
    if (q.grit) {
      gcell = Math.max(8, Math.round(Math.max(w, h) / 22)); gw = Math.ceil(w / gcell) + 2;
      const gh = Math.ceil(h / gcell) + 2; grit = new Float32Array(gw * gh); let sd = 987;
      for (let i = 0; i < grit.length; i++) { sd = (Math.imul(sd, 1664525) + 1013904223) | 0; grit[i] = (sd >>> 8) / 16777216; }
    }
    const diag = Math.hypot(w, h);
    if (q.sharp) {
      // 선명도: 주변 4칸 평균과의 차이를 더한다 (언샤프)
      const src = new Uint8ClampedArray(d), amt = q.sharp * 1.2, row = w * 4;
      for (let y = 1; y < h - 1; y++) for (let x = 1, i = y * row + 4; x < w - 1; x++, i += 4) for (let c = 0; c < 3; c++) {
        const k = i + c; d[k] = src[k] + amt * (src[k] - (src[k - 4] + src[k + 4] + src[k - row] + src[k + row]) / 4);
      }
    }
    const gain = Math.pow(2, q.exp), lift = q.fade * 0.12;
    const cx = w / 2, cy = h / 2, rr = cx * cx + cy * cy;
    let seed = 12345;
    for (let y = 0, i = 0; y < h; y++) {
      const dy = (y - cy) * (y - cy);
      for (let x = 0; x < w; x++, i += 4) {
        let r = d[i] / 255 * gain, g = d[i + 1] / 255 * gain, b = d[i + 2] / 255 * gain;
        r += q.warm * .08; b -= q.warm * .08; g += q.tint * .05; r -= q.tint * .015; b -= q.tint * .015;
        r = (r - .5) * (1 + q.con) + .5; g = (g - .5) * (1 + q.con) + .5; b = (b - .5) * (1 + q.con) + .5;
        const pi = i >> 2;
        if (Lb) { const det = Math.max(-.12, Math.min(.12, (L0[pi] - Lb[pi]) * q.clarity * 1.8)), wt = Math.max(.25, 1 - Math.abs(L0[pi] - .5) * 1.3); r += det * wt; g += det * wt; b += det * wt; }
        let L = .299 * r + .587 * g + .114 * b;
        const sat = 1 + q.sat - q.bw - q.sepia;
        r = L + (r - L) * sat; g = L + (g - L) * sat; b = L + (b - L) * sat;
        if (q.sepia) { const t = q.sepia; r += (L * 1.07 - r) * t + .06 * t * (1 - L); g += (L * .87 - g) * t; b += (L * .62 - b) * t; }
        const Lc = Math.min(1, Math.max(0, L)), ws = (1 - Lc) * (1 - Lc), wh = Lc * Lc;
        r += q.sh[0] * ws + q.hi[0] * wh; g += q.sh[1] * ws + q.hi[1] * wh; b += q.sh[2] * ws + q.hi[2] * wh;
        if (lift) { r = r * (1 - lift) + lift; g = g * (1 - lift) + lift; b = b * (1 - lift) + lift; }
        if (q.vig) { const k = 1 - q.vig * .55 * Math.pow(((x - cx) * (x - cx) + dy) / rr, 1.3); r *= k; g *= k; b *= k; }
        if (Bb) { const k = Bb[pi] * q.bloom * .85; r += k * (1.05 - r * .5); g += k * (1 - g * .5); b += k * (.92 - b * .5); }
        if (q.leak) {
          const f1 = Math.max(0, 1 - Math.hypot(x, y) / (diag * .7)) ** 2, f2 = Math.max(0, 1 - Math.hypot(w - x, h - y) / (diag * .55)) ** 2;
          r += q.leak * (.5 * f1 + .32 * f2); g += q.leak * (.2 * f1 + .04 * f2); b += q.leak * (.02 * f1 + .24 * f2);
        }
        if (grit) {
          const gx = x / gcell, gy = y / gcell, x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0, o = y0 * gw + x0;
          const v = (grit[o] * (1 - fx) + grit[o + 1] * fx) * (1 - fy) + (grit[o + gw] * (1 - fx) + grit[o + gw + 1] * fx) * fy;
          const k = 1 - Math.max(0, v - .45) * q.grit * .7; r *= k; g *= k; b *= k * .97;
        }
        if (q.grain) { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; const n = ((seed >>> 24) / 255 - .5) * q.grain * .09; r += n; g += n; b += n; }
        if (q.curve) { const C = q.curve; r = C[Math.min(255, Math.max(0, Math.round(r * 255)))]; g = C[Math.min(255, Math.max(0, Math.round(g * 255)))]; b = C[Math.min(255, Math.max(0, Math.round(b * 255)))]; }
        d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // 비율 + 필터를 적용해 w×h 캔버스에 그린다. src 는 회전까지 반영된 캔버스.
  // 테두리·프레임: 결과 크기(인스타 비율)는 그대로 두고, 사진이 들어갈 안쪽 칸을 정한다.
  const FRAMES = [
    { id: 'none', name: '없음' }, { id: 'white', name: '흰 테두리' }, { id: 'black', name: '검정 테두리' },
    { id: 'polaroid', name: '폴라로이드' }, { id: 'round', name: '둥근 모서리' }, { id: 'film', name: '필름' }, { id: 'date', name: '날짜 스탬프' },
  ];
  function frameInset(id, w, h) {
    const m = Math.min(w, h);
    if (id === 'white' || id === 'black') { const b = Math.round(m * .045); return { x: b, y: b, w: w - 2 * b, h: h - 2 * b }; }
    if (id === 'polaroid') { const b = Math.round(m * .055), bottom = Math.round(h * .17); return { x: b, y: b, w: w - 2 * b, h: h - b - bottom }; }
    if (id === 'round') { const b = Math.round(m * .035); return { x: b, y: b, w: w - 2 * b, h: h - 2 * b }; }
    if (id === 'film') { const b = Math.round(h * .085), side = Math.round(w * .02); return { x: side, y: b, w: w - 2 * side, h: h - 2 * b }; }
    return null;
  }
  function stampDate() { const d = session?.date || new Date(); return "'" + String(d.getFullYear()).slice(2) + ' ' + String(d.getMonth() + 1).padStart(2, '0') + ' ' + String(d.getDate()).padStart(2, '0'); }
  // 배경 흐림(인물 사진)과 이중 노출을 원본 그림에 먼저 적용한다. cache.mask 에 사람 마스크를 보관해 다시 쓴다.
  async function prepare(src, spec, second, cache = {}) {
    const bokeh = Number(spec.bokeh) || 0, dbl = second && spec.dbl;
    if (!bokeh && !dbl) return src;
    const needMask = bokeh || dbl.mode === 'inside';
    let mask = null;
    if (needMask) {
      if (!cache.mask || cache.maskFor !== src) { cache.mask = await PhotoSokFace.personMask(src, 300); cache.maskFor = src; }
      mask = cache.mask;
    }
    const w = src.width, h = src.height, out = document.createElement('canvas'); out.width = w; out.height = h;
    const x = out.getContext('2d');
    if (bokeh) {
      const r = Math.max(1, Math.round(Math.max(w, h) * bokeh / 100 * .03)), pad = r * 2;
      // 사람을 지운 배경만 흐리게 한다. 사람 자리는 더 넓게 흐린 배경으로 메워 가장자리에 사람 색이 번지지 않게.
      const bg = document.createElement('canvas'); bg.width = w; bg.height = h;
      const bx = bg.getContext('2d'); bx.drawImage(src, 0, 0); bx.globalCompositeOperation = 'destination-out'; bx.drawImage(mask, 0, 0); bx.drawImage(mask, 0, 0);
      x.filter = `blur(${r * 2}px)`; x.drawImage(src, -pad * 2, -pad * 2, w + pad * 4, h + pad * 4);
      for (const k of [6, 3, 1]) { x.filter = `blur(${r * k}px)`; x.drawImage(bg, -pad, -pad, w + pad * 2, h + pad * 2); }
      x.filter = 'none'; bg.width = bg.height = 1;
      const person = document.createElement('canvas'); person.width = w; person.height = h;
      const px = person.getContext('2d'); px.drawImage(mask, 0, 0); px.globalCompositeOperation = 'source-in'; px.drawImage(src, 0, 0);
      x.drawImage(person, 0, 0); person.width = person.height = 1;
    } else x.drawImage(src, 0, 0);
    if (dbl) {
      const l = PhotoEngine.coverLayout(second.width, second.height, w, h, null);
      const layer = document.createElement('canvas'); layer.width = w; layer.height = h;
      const lx = layer.getContext('2d');
      lx.drawImage(second, w / 2 + l.dx - second.width * l.scale / 2, h / 2 + l.dy - second.height * l.scale / 2, second.width * l.scale, second.height * l.scale);
      if (dbl.mode === 'inside') { lx.globalCompositeOperation = 'destination-in'; lx.drawImage(mask, 0, 0); }
      x.save(); x.globalAlpha = Math.min(1, Math.max(.1, (dbl.amount ?? 60) / 100));
      x.globalCompositeOperation = dbl.mode === 'inside' ? 'screen' : dbl.mode; x.drawImage(layer, 0, 0); x.restore();
      layer.width = layer.height = 1;
    }
    return out;
  }
  function compose(out, src, spec) {
    const id = spec.frame || 'none', w = out.width, h = out.height;
    const ins = frameInset(id, w, h);
    if (!ins) { composeCore(out, src, spec); if (id === 'date') drawDate(out.getContext('2d'), w, h, spec); drawStickers(out.getContext('2d'), w, h, spec.stickers, spec._sel); return; }
    const tmp = document.createElement('canvas'); tmp.width = Math.max(1, ins.w); tmp.height = Math.max(1, ins.h);
    composeCore(tmp, src, spec);
    const ctx = out.getContext('2d');
    ctx.save();
    ctx.fillStyle = id === 'black' || id === 'film' ? '#0d0d0d' : id === 'polaroid' ? '#fbfaf6' : '#ffffff';
    ctx.fillRect(0, 0, w, h);
    if (id === 'round') {
      const r = Math.min(ins.w, ins.h) * .07;
      ctx.beginPath(); ctx.moveTo(ins.x + r, ins.y); ctx.arcTo(ins.x + ins.w, ins.y, ins.x + ins.w, ins.y + ins.h, r); ctx.arcTo(ins.x + ins.w, ins.y + ins.h, ins.x, ins.y + ins.h, r); ctx.arcTo(ins.x, ins.y + ins.h, ins.x, ins.y, r); ctx.arcTo(ins.x, ins.y, ins.x + ins.w, ins.y, r); ctx.closePath(); ctx.clip();
    }
    ctx.drawImage(tmp, ins.x, ins.y);
    ctx.restore();
    if (id === 'film') {
      ctx.fillStyle = '#f3efe4';
      const hole = ins.y * .36, gap = hole * 1.9;
      for (let x = gap / 2; x < w; x += gap) for (const y of [ins.y / 2, h - ins.y / 2]) { ctx.beginPath(); const r = hole * .2; const x0 = x - hole / 2, y0 = y - hole / 2; ctx.moveTo(x0 + r, y0); ctx.arcTo(x0 + hole, y0, x0 + hole, y0 + hole, r); ctx.arcTo(x0 + hole, y0 + hole, x0, y0 + hole, r); ctx.arcTo(x0, y0 + hole, x0, y0, r); ctx.arcTo(x0, y0, x0 + hole, y0, r); ctx.fill(); }
    }
    if (id === 'polaroid' && spec.caption !== false) {
      ctx.fillStyle = '#8a857a'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.font = `500 ${Math.round(Math.min(w, h) * .038)}px "Pretendard", sans-serif`;
      ctx.fillText(stampDate().replace(/ /g, '.').replace("'", '20'), w - ins.x * 1.4, ins.y + ins.h + (h - ins.y - ins.h) / 2);
    }
    tmp.width = tmp.height = 1;
    drawStickers(ctx, w, h, spec.stickers, spec._sel);
  }
  function drawDate(ctx, w, h) {
    const px = Math.round(Math.min(w, h) * .045);
    ctx.save();
    ctx.font = `700 ${px}px "Courier New", ui-monospace, monospace`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(255,120,30,.9)'; ctx.shadowBlur = px * .45;
    ctx.fillStyle = '#ff9a3c';
    ctx.fillText(stampDate(), w - px * 1.2, h - px * 1.1);
    ctx.restore();
  }
  function composeCore(out, src, spec) {
    const ctx = out.getContext('2d'), w = out.width, h = out.height;
    ctx.imageSmoothingQuality = 'high';
    const fit = spec.ratio === 'orig' ? 'cover' : spec.fit;
    if (fit === 'cover') {
      const l = PhotoEngine.coverLayout(src.width, src.height, w, h, spec.ratio === 'orig' ? null : spec.crop);
      ctx.drawImage(src, w / 2 + l.dx - src.width * l.scale / 2, h / 2 + l.dy - src.height * l.scale / 2, src.width * l.scale, src.height * l.scale);
    } else {
      if (fit === 'blur') {
        const l = PhotoEngine.coverLayout(src.width, src.height, w, h, null);
        ctx.save(); ctx.filter = `blur(${Math.round(Math.max(w, h) / 40)}px) brightness(.85)`;
        ctx.drawImage(src, w / 2 - src.width * l.scale * .55, h / 2 - src.height * l.scale * .55, src.width * l.scale * 1.1, src.height * l.scale * 1.1);
        ctx.restore();
      } else { ctx.fillStyle = fit === 'black' ? '#000' : '#fff'; ctx.fillRect(0, 0, w, h); }
      const s = Math.min(w / src.width, h / src.height);
      ctx.drawImage(src, (w - src.width * s) / 2, (h - src.height * s) / 2, src.width * s, src.height * s);
    }
    grade(ctx, w, h, params(spec.filter, spec.strength, spec.adj || {}, spec.curve));
  }
  function frameSize(spec, src, maxEdge) {
    const r = RATIOS.find(x => x.id === spec.ratio);
    let w = r?.w || src.width, h = r?.h || src.height;
    const s = Math.min(1, maxEdge / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
  }
  async function oriented(file, rotation, maxEdge) {
    const src = await PhotoEngine.decode(file);
    try {
      const q = rotation === 90 || rotation === 270;
      const ow = q ? src.height : src.width, oh = q ? src.width : src.height;
      const s = Math.min(1, maxEdge / Math.max(ow, oh));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(ow * s)); c.height = Math.max(1, Math.round(oh * s));
      const x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2); x.rotate(rotation * Math.PI / 180);
      const dw = q ? c.height : c.width, dh = q ? c.width : c.height;
      x.drawImage(src.image, -dw / 2, -dh / 2, dw, dh);
      return c;
    } finally { src.close(); }
  }

  function build() {
    dialog = document.createElement('dialog');
    dialog.id = 'decoDialog';
    dialog.innerHTML = `
      <div class="deco-top"><button type="button" class="deco-x" id="decoClose" aria-label="꾸미기 닫기"><svg><use href="#i-close"/></svg></button><h2 id="decoToolName">필터</h2><button type="button" class="deco-done" id="decoApply">완료</button></div>
      <div class="text-stage"><canvas id="decoCanvas" aria-label="꾸미기 미리보기"></canvas></div>
      <p class="text-hint" id="decoHint"></p>
      <div class="deco-panel">
      <div id="decoFilterPane">
        <div class="deco-filters" id="decoFilters" role="group" aria-label="필터"></div>
        <label class="crop-zoom"><span>강도</span><input type="range" id="decoStrength" min="0" max="150" step="5" aria-label="필터 강도"><b id="decoStrengthValue"></b></label>
        <div class="deco-adj-actions"><button type="button" class="small-button" id="decoDeleteMy" hidden>이 내 필터 지우기</button></div>
      </div>
      <div id="decoAdjustPane" hidden>
        <div class="deco-dials" id="decoAdjPick" role="group" aria-label="조절 항목">${ADJ.map(a => `<button type="button" data-adjpick="${a.k}"><i>${ADJ_ICON[a.k] || ''}</i><span>${a.name}</span></button>`).join('')}<button type="button" data-adjpick="curve"><i>${ADJ_ICON.curve}</i><span>커브</span></button><button type="button" data-adjpick="wb" id="decoAutoWb"><i>${ADJ_ICON.wb}</i><span>자동 색</span></button></div>
        ${ADJ.map(a => `<label class="crop-zoom adj" data-adjrow="${a.k}" hidden><span>${a.name}</span><input type="range" data-adj="${a.k}" min="${a.min ?? -100}" max="100" step="1" aria-label="${a.name}"><b data-adjv="${a.k}">0</b></label>`).join('')}
        <div id="decoCurveBox" hidden>
          <canvas class="deco-curve" id="decoCurve" width="520" height="300" aria-label="커브"></canvas>
          <div class="deco-adj-actions"><button type="button" class="small-button" id="decoCurveS">대비 곡선(S)</button><button type="button" class="small-button" id="decoCurveReset">커브 초기화</button></div>
        </div>
        <div class="deco-adj-actions"><button type="button" class="small-button" id="decoAdjReset">조절 초기화</button><button type="button" class="small-button" id="decoSaveMy">내 필터로 저장</button></div>
      </div>
      <div id="decoEffectPane" hidden>
        <p class="deco-label">인물 배경 흐리게</p>
        <label class="crop-zoom"><span>흐림</span><input type="range" id="decoBokeh" min="0" max="100" step="5" aria-label="배경 흐림"><b id="decoBokehValue"></b></label>
        <p class="deco-note" id="decoBokehNote">사람을 찾아 뒤 배경만 흐리게 해요. 사람이 없는 사진은 바뀌지 않아요.</p>
        <p class="deco-label">이중 노출</p>
        <div class="deco-adj-actions"><button type="button" class="small-button" id="decoDblPick">겹칠 사진 고르기</button><button type="button" class="small-button" id="decoDblClear" hidden>겹친 사진 빼기</button></div>
        <input type="file" id="decoDblFile" accept="image/*" hidden>
        <div id="decoDblRow" hidden>
          <div class="text-row wrap" id="decoDblModes" role="group" aria-label="섞는 방식"><button type="button" data-dbl="screen">밝게 겹치기</button><button type="button" data-dbl="multiply">어둡게 겹치기</button><button type="button" data-dbl="overlay">진하게 겹치기</button><button type="button" data-dbl="inside">사람 안에만</button></div>
          <label class="crop-zoom"><span>진하기</span><input type="range" id="decoDblAmount" min="10" max="100" step="5" aria-label="겹친 사진 진하기"><b id="decoDblValue"></b></label>
        </div>
      </div>
      <div id="decoStickerPane" hidden>
        <div class="deco-packs" id="decoPacks" role="tablist" aria-label="스티커 모음">${ART.map(p => `<button type="button" data-pack="${p.id}">${p.name}</button>`).join('')}<button type="button" data-pack="mine">내 스티커</button><button type="button" data-pack="emoji">이모지</button><button type="button" data-pack="label">글씨 라벨</button></div>
        <div class="deco-emojis" id="decoEmojis" role="group" aria-label="스티커"></div>
        <div class="deco-adj-actions"><button type="button" class="small-button" id="decoFaceStick">고른 스티커를 얼굴에 붙이기</button></div>
      </div>
      <div id="decoTextPane" hidden>
        <div class="deco-text-add"><input type="text" id="decoText" maxlength="40" placeholder="넣을 글씨" aria-label="넣을 글씨"><button type="button" class="small-button" id="decoTextAdd">글씨 붙이기</button></div>
        <div class="deco-fonts" id="decoFx" role="group" aria-label="글씨 모양">${TEXT_FX.map(f => `<button type="button" data-fx="${f.id}" class="fx-${f.id}"><b>가Aa</b><span>${f.name}</span></button>`).join('')}</div>
        <div class="deco-swatches" id="decoColors" role="group" aria-label="글씨 색"></div>
        <label class="crop-zoom hue"><span>색조</span><input type="range" id="decoHue" min="0" max="360" step="1" aria-label="색조"></label>
        <label class="crop-zoom satr"><span>채도</span><input type="range" id="decoSatC" min="0" max="100" step="1" aria-label="채도"></label>
        <label class="crop-zoom lumr"><span>밝기</span><input type="range" id="decoLum" min="10" max="95" step="1" aria-label="밝기"></label>
      </div>
      <div id="decoFramePane" hidden>
        <p class="deco-label">비율</p>
        <div class="text-row wrap" id="decoRatios" role="group" aria-label="인스타 비율">${RATIOS.map(r => `<button type="button" data-ratio="${r.id}">${r.name}</button>`).join('')}</div>
        <div class="text-row wrap" id="decoFits" role="group" aria-label="비율이 다를 때">${FITS.map(f => `<button type="button" data-fit="${f.id}">${f.name}</button>`).join('')}</div>
        <label class="crop-zoom" id="decoZoomRow"><span>확대</span><input type="range" id="decoZoom" min="100" max="400" step="1" aria-label="확대"></label>
        <p class="deco-label">테두리</p>
        <div class="text-row wrap" id="decoFrames" role="group" aria-label="테두리">${FRAMES.map(f => `<button type="button" data-frame="${f.id}">${f.name}</button>`).join('')}</div>
      </div>
      <div id="decoSelRow" hidden>
        <label class="crop-zoom"><span>크기</span><input type="range" id="decoStSize" min="3" max="45" step="1" aria-label="스티커 크기"></label>
        <label class="crop-zoom"><span>회전</span><input type="range" id="decoStRot" min="-180" max="180" step="1" aria-label="스티커 회전"></label>
        <div class="deco-adj-actions"><button type="button" class="small-button" id="decoStDel">이 스티커 지우기</button><button type="button" class="small-button" id="decoStClear">스티커 모두 지우기</button></div>
      </div>
      </div>
      <nav class="deco-tools" role="tablist" aria-label="꾸미기 도구">${TOOLS.map(t => `<button type="button" role="tab" data-dtab="${t.id}"><svg viewBox="0 0 24 24" aria-hidden="true">${t.icon}</svg><span>${t.name}</span></button>`).join('')}</nav>
      <div class="deco-save-row"><button type="button" class="small-button" id="decoAll">모든 사진에 적용</button><button type="button" class="primary" id="decoSave">꾸며서 저장</button></div>`;
    document.body.append(dialog);
    canvas = $('decoCanvas');
    $('decoClose').onclick = () => dialog.close();
    dialog.addEventListener('close', () => { if (session?.view && session.view !== session.preview) session.view.width = session.view.height = 1; session = null; });
    dialog.querySelectorAll('[data-dtab]').forEach(b => b.onclick = () => {
      const t = b.dataset.dtab; tab = t;
      for (const [id, pane] of [['filter', 'decoFilterPane'], ['adjust', 'decoAdjustPane'], ['effect', 'decoEffectPane'], ['sticker', 'decoStickerPane'], ['text', 'decoTextPane'], ['frame', 'decoFramePane']]) $(pane).hidden = t !== id;
      $('decoToolName').textContent = TOOLS.find(x => x.id === t).name;
      if (t === 'adjust') drawCurve();
      dialog.querySelectorAll('[data-dtab]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
      if (!stickerTab()) session.sel = -1;
      dialog.querySelector('.deco-panel').scrollTop = 0;
      sync(); schedule();
    });
    const T = window.PhotoSokText;
    $('decoColors').innerHTML = Object.entries(T?.COLORS || { white: '#ffffff' }).map(([k, v]) => `<button type="button" data-scolor="${k}" aria-label="${(T?.COLOR_NAMES || {})[k] || k}" style="--sw:${v}"></button>`).join('');
    const stickers = () => session.spec.stickers || (session.spec.stickers = []);
    const selected = () => stickers()[session.sel];
    // 새 글씨를 쓰는 중이면 효과·색은 새 글씨에 쓰고, 고른 스티커는 건드리지 않는다.
    const composing = () => !!$('decoText').value.trim();
    const add = st => {
      if (stickers().length >= 20) { toast('스티커는 20개까지 붙일 수 있어요.', true); return; }
      const n = stickers().length, off = (n % 5) * .05;
      stickers().push({ x: .5 + off - .1, y: .45 + off - .1, r: 0, ...st }); session.sel = stickers().length - 1; sync(); schedule();
    };
    const showPack = async id => {
      session.pack = id;
      dialog.querySelectorAll('[data-pack]').forEach(b => { const on = b.dataset.pack === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
      const box = $('decoEmojis'); box.replaceChildren(); box.classList.toggle('labels', id === 'label'); const art = ART.find(p => p.id === id); box.classList.toggle('mine', id === 'mine' || !!art);
      if (id === 'label') {
        LABELS.forEach(l => { const b = document.createElement('button'); b.type = 'button'; b.textContent = l.text; b.className = 'label-chip fx-' + l.fx; b.onclick = () => add({ t: 'text', text: l.text, fx: l.fx, color: l.color, s: .075 }); box.append(b); });
      } else if (art) {
        art.items.forEach(src => { const b = document.createElement('button'); b.type = 'button'; const img = document.createElement('img'); img.src = src; img.alt = art.name + ' 스티커'; img.loading = 'lazy'; b.append(img); b.onclick = async () => { await warmOne(src); session.lastArt = src; add({ t: 'art', src, s: .26 }); }; box.append(b); });
      } else if (id === 'mine') {
        const M = window.PhotoSokMyStickers, list = M ? await M.list() : [];
        if (session.pack !== 'mine') return;
        list.forEach(m => { const b = document.createElement('button'); b.type = 'button'; const img = document.createElement('img'); img.src = m.url; img.alt = '내 스티커'; b.append(img); b.onclick = () => add({ t: 'img', id: m.id, s: .3 }); box.append(b); });
        const mk = document.createElement('button'); mk.type = 'button'; mk.className = 'make'; mk.textContent = '+ 만들기'; mk.onclick = () => { dialog.close(); window.PhotoSokStickerMaker?.start(); }; box.append(mk);
      } else {
        PACKS.flatMap(p => p.items).forEach(e => { const b = document.createElement('button'); b.type = 'button'; b.textContent = e; b.dataset.emoji = e; b.onclick = () => { session.lastEmoji = e; session.lastArt = null; add({ t: 'emoji', e, s: .16 }); }; box.append(b); });
      }
    };
    dialog.querySelectorAll('[data-pack]').forEach(b => b.onclick = () => showPack(b.dataset.pack));
    showPackRef = showPack;
    $('decoFaceStick').onclick = async () => {
      const art = session.lastArt, e = session.lastEmoji || '😎', btn = $('decoFaceStick'); btn.disabled = true;
      try {
        const r = await PhotoSokFace.detect(session.view || session.preview);
        if (!r.faces.length) { toast('얼굴을 찾지 못했어요.', true); return; }
        // 결과 비율(잘라 채우기)과 원본 좌표가 다를 수 있어 원본 비율일 때만 정확하다
        const cw = canvas.width, ch = canvas.height, sw = (session.view || session.preview).width, sh = (session.view || session.preview).height;
        const l = session.spec.ratio === 'orig' ? null : PhotoEngine.coverLayout(sw, sh, cw, ch, session.spec.fit === 'cover' ? session.spec.crop : null);
        for (const f of r.faces.slice(0, 10)) {
          let x = f.cx, y = (f.top + f.chinY) / 2, size = (f.chinY - f.top) * sh * 1.35;
          if (l) { x = (cw / 2 + l.dx + (x - .5) * sw * l.scale) / cw; y = (ch / 2 + l.dy + (y - .5) * sh * l.scale) / ch; size *= l.scale; }
          stickers().push({ ...(art ? { t: 'art', src: art } : { t: 'emoji', e }), x, y, r: 0, s: Math.min(.9, size / Math.min(cw, ch)) });
        }
        session.sel = stickers().length - 1; sync(); schedule();
        toast(art ? '얼굴 ' + Math.min(10, r.faces.length) + '곳에 고른 스티커를 붙였어요.' : r.faces.length + '명의 얼굴에 ' + e + ' 를 붙였어요.');
      } catch (err) { toast(errText(err, '얼굴을 찾지 못했어요.'), true); }
      finally { btn.disabled = false; }
    };
    $('decoTextAdd').onclick = () => {
      const text = $('decoText').value.trim();
      if (!text) { $('decoText').focus(); toast('넣을 글씨를 먼저 써주세요.', true); return; }
      add({ t: 'text', text, fx: session.fx || 'neon', color: session.scolor || 'pink', s: .085 });
      $('decoText').value = '';
    };
    $('decoText').oninput = () => sync();
    $('decoText').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('decoTextAdd').click(); } };
    dialog.querySelectorAll('[data-fx]').forEach(b => b.onclick = () => { session.fx = b.dataset.fx; const st = composing() ? null : selected(); if (st?.t === 'text') st.fx = b.dataset.fx; sync(); schedule(); });
    $('decoColors').querySelectorAll('[data-scolor]').forEach(b => b.onclick = () => pickColor(b.dataset.scolor));
    $('decoStSize').oninput = () => { const st = selected(); if (st) { st.s = $('decoStSize').value / 100; schedule(); } };
    $('decoStRot').oninput = () => { const st = selected(); if (st) { st.r = Number($('decoStRot').value); schedule(); } };
    $('decoStDel').onclick = () => { if (session.sel >= 0) { stickers().splice(session.sel, 1); session.sel = -1; sync(); schedule(); } };
    $('decoStClear').onclick = () => { session.spec.stickers = []; session.sel = -1; sync(); schedule(); };
    dialog.querySelectorAll('[data-adjpick]').forEach(b => { if (b.dataset.adjpick !== 'wb') b.onclick = () => { session.adjKey = b.dataset.adjpick; sync(); if (session.adjKey === 'curve') drawCurve(); }; });
    // 글씨 색: 색 동그라미 또는 색조·채도·밝기
    function pickColor(c) { session.scolor = c; const st = composing() ? null : selected(); if (st?.t === 'text') st.color = c; sync(); schedule(); }
    const hslInput = () => pickColor(hslHex(+$('decoHue').value, +$('decoSatC').value, +$('decoLum').value));
    ['decoHue', 'decoSatC', 'decoLum'].forEach(id => $(id).oninput = hslInput);
    dialog.querySelectorAll('[data-adj]').forEach(r => r.oninput = () => { session.spec.adj[r.dataset.adj] = Number(r.value); sync(); schedule(); });
    $('decoAdjReset').onclick = () => { session.spec.adj = {}; session.spec.curve = null; sync(); drawCurve(); schedule(); };
    $('decoCurveReset').onclick = () => { session.spec.curve = null; drawCurve(); schedule(); };
    $('decoCurveS').onclick = () => { session.spec.curve = [0, .2, .5, .8, 1]; drawCurve(); schedule(); };
    $('decoAutoWb').onclick = () => {
      // 회색 세계 가정: 아주 밝거나 어두운 곳을 뺀 평균색이 회색이 되도록 색온도·색조를 맞춘다.
      const c = session.preview, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let R = 0, G = 0, B = 0, n = 0;
      for (let i = 0; i < d.length; i += 16) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; if (l < 25 || l > 235) continue; R += d[i]; G += d[i + 1]; B += d[i + 2]; n++; }
      if (!n) { toast('색을 맞출 부분을 찾지 못했어요.', true); return; }
      R /= n; G /= n; B /= n;
      const warm = Math.max(-100, Math.min(100, Math.round((B - R) / 255 / .16 * 100)));
      const tint = Math.max(-100, Math.min(100, Math.round(((R + B) / 2 - G) / 255 / .065 * 100 / .8)));
      session.spec.adj.warm = warm; session.spec.adj.tint = tint; sync(); schedule();
      toast('사진의 색을 자동으로 맞췄어요. 색온도·색조 막대로 더 고칠 수 있어요.');
    };
    // 커브 편집: 가운데 세 점(¼·½·¾)과 양 끝 점을 위아래로 끈다
    const cv = $('decoCurve'); let cdrag = -1;
    const cpos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height }; };
    cv.addEventListener('pointerdown', e => {
      const p = cpos(e), c = session.spec.curve || CURVE_X.slice();
      let best = 0; CURVE_X.forEach((x, i) => { if (Math.abs(x - p.x) < Math.abs(CURVE_X[best] - p.x)) best = i; });
      cdrag = best; session.spec.curve = c; cv.setPointerCapture(e.pointerId);
      c[best] = Math.min(1, Math.max(0, p.y)); drawCurve(); schedule();
    });
    cv.addEventListener('pointermove', e => { if (cdrag < 0) return; session.spec.curve[cdrag] = Math.min(1, Math.max(0, cpos(e).y)); drawCurve(); schedule(); });
    const cend = () => { if (cdrag >= 0 && isFlat(session.spec.curve)) session.spec.curve = null; cdrag = -1; };
    cv.addEventListener('pointerup', cend); cv.addEventListener('pointercancel', cend);
    // 효과: 배경 흐림, 이중 노출
    $('decoBokeh').oninput = () => { session.spec.bokeh = Number($('decoBokeh').value); $('decoBokehValue').textContent = session.spec.bokeh ? session.spec.bokeh + '%' : '끔'; prepareView(); };
    $('decoDblPick').onclick = () => $('decoDblFile').click();
    $('decoDblFile').onchange = async () => {
      const f = $('decoDblFile').files[0]; $('decoDblFile').value = ''; if (!f) return;
      try {
        const kept = await keepFile(f);
        session.second = kept; session.secondPreview = await oriented(kept, 0, 900);
        if (!session.spec.dbl) session.spec.dbl = { mode: 'screen', amount: 60 };
        sync(); prepareView();
      } catch (e) { toast(errText(e, '겹칠 사진을 열지 못했어요.'), true); }
    };
    $('decoDblClear').onclick = () => { session.second = null; session.secondPreview = null; session.spec.dbl = null; sync(); prepareView(); };
    dialog.querySelectorAll('[data-dbl]').forEach(b => b.onclick = () => { session.spec.dbl.mode = b.dataset.dbl; sync(); prepareView(); });
    $('decoDblAmount').oninput = () => { session.spec.dbl.amount = Number($('decoDblAmount').value); $('decoDblValue').textContent = session.spec.dbl.amount + '%'; prepareView(); };
    $('decoSaveMy').onclick = () => {
      const list = myFilters(); const q = params(session.spec.filter, session.spec.strength, session.spec.adj);
      const p = {}; for (const k of ['exp', 'con', 'sat', 'warm', 'tint', 'fade', 'vig', 'grain', 'sharp', 'bw', 'sepia', 'clarity', 'bloom', 'leak', 'grit']) if (q[k]) p[k] = +q[k].toFixed(4);
      if (q.sh.some(Boolean)) p.sh = q.sh.map(n => +n.toFixed(4)); if (q.hi.some(Boolean)) p.hi = q.hi.map(n => +n.toFixed(4));
      let n = 1; while (list.some(x => x.name === '내 필터 ' + n)) n++;
      const item = { id: Date.now().toString(36), name: '내 필터 ' + n, p };
      if (list.length >= 30) { toast('내 필터는 30개까지 저장할 수 있어요.', true); return; }
      list.unshift(item);
      if (!saveMy(list)) { toast('이 기기에서는 내 필터를 저장할 수 없어요.', true); return; }
      Object.assign(session.spec, { filter: 'my:' + item.id, strength: 100, adj: {} });
      thumbs(); sync(); schedule(); toast(item.name + '로 저장했어요. 필터 맨 앞에 있어요.');
    };
    $('decoDeleteMy').onclick = () => {
      const id = String(session.spec.filter).slice(3); saveMy(myFilters().filter(x => x.id !== id));
      session.spec.filter = 'none'; thumbs(); sync(); schedule(); toast('내 필터를 지웠어요.');
    };
    $('decoStrength').oninput = () => { session.spec.strength = Number($('decoStrength').value); sync(); schedule(); };
    $('decoZoom').oninput = () => { session.spec.crop.zoom = $('decoZoom').value / 100; schedule(); };
    dialog.querySelectorAll('[data-ratio]').forEach(b => b.onclick = () => { session.spec.ratio = b.dataset.ratio; session.spec.crop = { x: .5, y: .5, zoom: 1 }; resize(); sync(); schedule(); });
    dialog.querySelectorAll('[data-fit]').forEach(b => b.onclick = () => { session.spec.fit = b.dataset.fit; sync(); schedule(); });
    dialog.querySelectorAll('[data-frame]').forEach(b => b.onclick = () => { session.spec.frame = b.dataset.frame; sync(); schedule(); });
    $('decoApply').onclick = () => finish('apply');
    $('decoSave').onclick = () => finish('save');
    $('decoAll').onclick = () => finish('all');
    let last = null, drag = -1;
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId); last = { x: e.clientX, y: e.clientY }; drag = -1;
      if (!session) return;
      const r = canvas.getBoundingClientRect(), k = canvas.width / r.width;
      const hit = hitSticker(canvas.getContext('2d'), session.spec.stickers, canvas.width, canvas.height, (e.clientX - r.left) * k, (e.clientY - r.top) * k);
      if (hit >= 0) {
        drag = hit; session.sel = hit;
        if (!stickerTab()) dialog.querySelector(`[data-dtab="${session.spec.stickers[hit].t === 'text' ? 'text' : 'sticker'}"]`).click(); else { sync(); schedule(); }
      } else if (stickerTab() && session.sel >= 0) { session.sel = -1; sync(); schedule(); }
    });
    canvas.addEventListener('pointermove', e => {
      if (last && session && drag >= 0) {
        const r = canvas.getBoundingClientRect(), st = session.spec.stickers[drag];
        if (st) { st.x = Math.min(1, Math.max(0, st.x + (e.clientX - last.x) / r.width)); st.y = Math.min(1, Math.max(0, st.y + (e.clientY - last.y) / r.height)); }
        last = { x: e.clientX, y: e.clientY }; schedule(); return;
      }
      if (!last || !session || !movable()) return;
      const ratio = canvas.width / canvas.getBoundingClientRect().width, s = session, c = s.spec.crop;
      const l = PhotoEngine.coverLayout(s.preview.width, s.preview.height, canvas.width, canvas.height, c);
      if (l.overflowX > 0) c.x = Math.min(1, Math.max(0, c.x - (e.clientX - last.x) * ratio / l.overflowX));
      if (l.overflowY > 0) c.y = Math.min(1, Math.max(0, c.y - (e.clientY - last.y) * ratio / l.overflowY));
      last = { x: e.clientX, y: e.clientY }; schedule();
    });
    const end = () => { last = null; drag = -1; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  }
  const movable = () => session && session.spec.ratio !== 'orig' && session.spec.fit === 'cover';
  let raf = 0;
  function schedule() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; draw(); }); }
  function resize() { const f = frameSize(session.spec, session.preview, 640); canvas.width = f.w; canvas.height = f.h; }
  let tab = 'filter', showPackRef = null;
  const stickerTab = () => tab === 'sticker' || tab === 'text';
  function hslHex(h, sat, l) {
    sat /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = sat * Math.min(l, 1 - l);
    const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))).toString(16).padStart(2, '0');
    return '#' + f(0) + f(8) + f(4);
  }
  function hexHsl(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return [0, 0, 100];
    const n = parseInt(m[1], 16), r = (n >> 16) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let h = 0, sat = 0;
    if (d) { sat = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; }
    return [Math.round(h), Math.round(sat * 100), Math.round(l * 100)];
  }
  const colorHex = c => (window.PhotoSokText?.COLORS || {})[c] || (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#ffffff');
  function draw() { if (session) compose(canvas, session.view || session.preview, { ...session.spec, _sel: stickerTab() ? session.sel : -1 }); }
  function drawCurve() {
    if (!session) return;
    const cv = $('decoCurve'), x = cv.getContext('2d'), W = cv.width, H = cv.height, c = session.spec.curve || CURVE_X;
    const dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark';
    x.clearRect(0, 0, W, H);
    x.strokeStyle = dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.1)'; x.lineWidth = 2;
    for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(W * i / 4, 0); x.lineTo(W * i / 4, H); x.moveTo(0, H * i / 4); x.lineTo(W, H * i / 4); x.stroke(); }
    x.setLineDash([8, 8]); x.beginPath(); x.moveTo(0, H); x.lineTo(W, 0); x.stroke(); x.setLineDash([]);
    const f = curveFn(c); x.strokeStyle = '#c8f04a'; x.lineWidth = 5; x.beginPath();
    for (let i = 0; i <= 100; i++) { const t = i / 100, y = Math.min(1, Math.max(0, f(t))); i ? x.lineTo(t * W, H - y * H) : x.moveTo(t * W, H - y * H); }
    x.stroke();
    c.forEach((v, i) => { x.beginPath(); x.arc(CURVE_X[i] * W, H - v * H, 13, 0, 7); x.fillStyle = '#c8f04a'; x.fill(); x.lineWidth = 4; x.strokeStyle = dark ? '#101213' : '#ffffff'; x.stroke(); });
  }
  // 배경 흐림·이중 노출은 사람 찾기가 필요해서 미리 만들어 둔 그림(session.view) 위에서 미리보기를 그린다.
  let prepTimer = 0, prepSeq = 0;
  function prepareView() {
    clearTimeout(prepTimer);
    prepTimer = setTimeout(async () => {
      if (!session) return;
      const seq = ++prepSeq, s = session;
      try {
        const v = await prepare(s.preview, s.spec, s.secondPreview, s);
        if (seq !== prepSeq || s !== session) return;
        if (session.view && session.view !== session.preview) session.view.width = session.view.height = 1;
        session.view = v; schedule();
      } catch (e) {
        if (s !== session) return;
        s.spec.bokeh = 0; if (s.spec.dbl?.mode === 'inside') s.spec.dbl.mode = 'screen';
        sync(); toast(errText(e, '사람을 찾지 못해 배경 흐림을 쓸 수 없어요.'), true);
      }
    }, 90);
  }
  function sync() {
    const s = session.spec;
    dialog.querySelectorAll('[data-filter]').forEach(b => { const on = b.dataset.filter === s.filter; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    dialog.querySelectorAll('[data-ratio]').forEach(b => { const on = b.dataset.ratio === s.ratio; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    dialog.querySelectorAll('[data-frame]').forEach(b => { const on = b.dataset.frame === (s.frame || 'none'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    dialog.querySelectorAll('[data-fit]').forEach(b => { const on = b.dataset.fit === s.fit; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    $('decoFits').hidden = s.ratio === 'orig';
    $('decoZoomRow').hidden = !movable();
    $('decoStrength').closest('label').hidden = s.filter === 'none';
    $('decoStrength').value = s.strength; $('decoStrengthValue').textContent = s.strength + '%';
    $('decoZoom').value = Math.round(s.crop.zoom * 100);
    dialog.querySelectorAll('[data-adj]').forEach(r => { const v = Number(s.adj?.[r.dataset.adj]) || 0; r.value = v; dialog.querySelector(`[data-adjv="${r.dataset.adj}"]`).textContent = v > 0 ? '+' + v : v; });
    $('decoDeleteMy').hidden = !String(s.filter).startsWith('my:');
    $('decoBokeh').value = s.bokeh || 0; $('decoBokehValue').textContent = s.bokeh ? s.bokeh + '%' : '끔';
    const hasDbl = !!(session.second && s.dbl);
    $('decoDblRow').hidden = !hasDbl; $('decoDblClear').hidden = !hasDbl; $('decoDblPick').textContent = hasDbl ? '다른 사진으로 바꾸기' : '겹칠 사진 고르기';
    if (hasDbl) { $('decoDblAmount').value = s.dbl.amount ?? 60; $('decoDblValue').textContent = (s.dbl.amount ?? 60) + '%'; dialog.querySelectorAll('[data-dbl]').forEach(b => { const on = b.dataset.dbl === s.dbl.mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); }
    const ak = session.adjKey || 'exp';
    dialog.querySelectorAll('[data-adjpick]').forEach(b => { const k = b.dataset.adjpick, on = k === ak; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.classList.toggle('set', k === 'curve' ? !!s.curve : !!Number(s.adj?.[k])); });
    dialog.querySelectorAll('[data-adjrow]').forEach(r => { r.hidden = r.dataset.adjrow !== ak; });
    $('decoCurveBox').hidden = ak !== 'curve';
    const st = (s.stickers || [])[session.sel];
    $('decoSelRow').hidden = !st || !stickerTab();
    if (st) { $('decoStSize').value = Math.round(st.s * 100); $('decoStRot').value = st.r || 0; }
    const useSel = st?.t === 'text' && !$('decoText').value.trim();
    const fxNow = useSel ? st.fx : (session.fx || 'neon'), colNow = useSel ? st.color : (session.scolor || 'pink');
    dialog.querySelectorAll('[data-fx]').forEach(b => { const on = b.dataset.fx === fxNow; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    dialog.querySelectorAll('[data-scolor]').forEach(b => { const on = b.dataset.scolor === colNow; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    if (!['decoHue', 'decoSatC', 'decoLum'].includes(document.activeElement?.id)) { const [h, sa, l] = hexHsl(colorHex(colNow)); $('decoHue').value = h; $('decoSatC').value = sa; $('decoLum').value = Math.max(10, Math.min(95, l)); }
    const nowHex = colorHex(colNow), [hh] = hexHsl(nowHex);
    $('decoSatC').parentElement.style.setProperty('--hue', hh); $('decoLum').parentElement.style.setProperty('--hue', hh);
    dialog.querySelectorAll('.deco-fonts button').forEach(b => b.style.setProperty('--c', nowHex));
    $('decoHint').textContent = stickerTab() ? ((s.stickers || []).length ? '스티커를 끌어서 옮기고, 눌러서 고른 뒤 크기·회전을 바꿔요.' : '') : tab !== 'frame' ? '' : movable() ? '사진을 끌어서 보일 부분을 고를 수 있어요.' : s.ratio === 'orig' ? '비율을 고르면 1080px 너비로 맞춰요.' : '사진 전체가 보이도록 여백을 넣어요.';
  }
  function thumbs() {
    const box = $('decoFilters'); box.replaceChildren();
    const t = document.createElement('canvas'); const s = 72 / Math.max(session.preview.width, session.preview.height);
    t.width = Math.max(1, Math.round(session.preview.width * s)); t.height = Math.max(1, Math.round(session.preview.height * s));
    for (const f of [...myFilters().map(m => ({ id: 'my:' + m.id, name: '★ ' + m.name, p: m.p })), FILTERS[0], ...FILTERS.filter(f => f.group === '효과'), ...FILTERS.slice(1).filter(f => f.group !== '효과')]) {
      composeCore(t, session.preview, { ...DEFAULT, filter: f.id, strength: 100, adj: {} });
      const b = document.createElement('button'); b.type = 'button'; b.dataset.filter = f.id;
      const img = document.createElement('img'); img.alt = ''; img.src = t.toDataURL('image/jpeg', .8);
      const span = document.createElement('span'); span.textContent = f.name;
      b.append(img, span);
      b.onclick = () => { session.spec.filter = f.id; if (!session.spec.strength) session.spec.strength = 100; sync(); schedule(); };
      box.append(b);
    }
  }

  function baseOf(item) {
    if (item.decoBase) return item.decoBase;
    if (item.textBase) return item.textBase; // 글씨 넣기 전 사진 위에서 꾸민다
    return null;
  }
  async function open(item) {
    if (!item || state.busy) return;
    if (!dialog) build();
    let base = baseOf(item);
    try {
      if (!base) { const input = await itemInputFile(item); base = { file: input, rotation: item.sourceType === 'pdf' ? 0 : (item.rotation || 0) }; }
      const preview = await oriented(base.file, base.rotation, 640);
      session = { item, base, date: new Date((item.originalFile || item.file).lastModified || Date.now()), preview, spec: JSON.parse(JSON.stringify({ ...DEFAULT, ...(item.decoSpec || {}) })) };
      if (!session.spec.adj) session.spec.adj = {};
      if (!Array.isArray(session.spec.stickers)) session.spec.stickers = [];
      session.sel = -1;
      session.view = null; session.second = item.decoSecond || null;
      session.secondPreview = session.second ? await oriented(session.second, 0, 900) : null;
      if (!session.second) session.spec.dbl = null;
    } catch (e) { toast('사진을 열지 못했어요. 다시 시도해주세요.', true); return; }
    resize(); thumbs();
    dialog.querySelector('[data-dtab="filter"]').click();
    if (session.spec.bokeh || session.spec.dbl) prepareView();
    await window.PhotoSokMyStickers?.warm(session.spec.stickers);
    await warmArt(session.spec.stickers);
    showPackRef?.(session.pack || 'love');
    $('decoAll').hidden = state.items.filter(i => i.sourceType !== 'pdf').length < 2;
    dialog.showModal();
  }

  // 한 장에 꾸미기를 적용한다 (글씨가 있으면 꾸민 사진 위에 다시 얹는다).
  async function applyTo(item, base, spec, secondFile) {
    if (session) session.date = new Date((item.originalFile || item.file).lastModified || Date.now());
    const raw = await oriented(base.file, base.rotation, 4096);
    const second = secondFile && spec.dbl ? await oriented(secondFile, 0, 2400) : null;
    const src = await prepare(raw, spec, second, {});
    if (src !== raw) raw.width = raw.height = 1;
    if (second) second.width = second.height = 1;
    const f = frameSize(spec, src, spec.ratio === 'orig' ? 4096 : 1920);
    const out = document.createElement('canvas'); out.width = f.w; out.height = f.h;
    compose(out, src, spec);
    src.width = src.height = 1;
    const decoBlob = await new Promise(res => out.toBlob(res, 'image/jpeg', 0.95));
    if (!decoBlob) throw new Error();
    const stem = (item.originalFile?.name || item.file.name || '사진').replace(/\.[^.]+$/, '').replace(/_(글씨|꾸미기)$/, '');
    let finalBlob = decoBlob;
    if (item.textSpec && window.PhotoSokText) {
      try { await document.fonts.load('700 40px Pretendard', item.textSpec.text); } catch (_) {}
      const copy = document.createElement('canvas'); copy.width = out.width; copy.height = out.height;
      copy.getContext('2d').drawImage(out, 0, 0);
      PhotoSokText.paint(out.getContext('2d'), copy, out.width, out.height, item.textSpec);
      copy.width = copy.height = 1;
      finalBlob = await new Promise(res => out.toBlob(res, 'image/jpeg', 0.95));
      item.textBase = { file: new File([decoBlob], stem + '_꾸미기.jpg', { type: 'image/jpeg' }), rotation: 0 };
    }
    const width = out.width, height = out.height; out.width = out.height = 1;
    if (!item.editBackup) item.editBackup = { file: item.file, sourceType: item.sourceType, pageIndex: item.pageIndex, width: item.width, height: item.height, rotation: item.rotation, url: item.url };
    else if (item.url !== item.editBackup.url) URL.revokeObjectURL(item.url);
    item.decoBase = base; item.decoSpec = JSON.parse(JSON.stringify(spec)); item.decoSecond = secondFile && spec.dbl ? secondFile : null;
    const name = stem + '_꾸미기.jpg';
    item.file = new File([finalBlob], name, { type: 'image/jpeg' });
    item.sourceType = 'photo'; delete item.pageIndex;
    item.url = URL.createObjectURL(item.file); item.width = width; item.height = height; item.rotation = 0;
    touchItem(item);
    return { blob: finalBlob, name };
  }
  async function baseFor(item) {
    const b = baseOf(item); if (b) return b;
    const input = await itemInputFile(item);
    return { file: input, rotation: item.sourceType === 'pdf' ? 0 : (item.rotation || 0) };
  }

  async function finish(mode) {
    if (!session) return;
    const { item, base, spec, second } = session;
    const buttons = ['decoApply', 'decoSave', 'decoAll'].map($).filter(Boolean);
    buttons.forEach(b => b.disabled = true);
    try {
      const r = await applyTo(item, base, spec, second);
      if (mode === 'all') {
        const others = state.items.filter(i => i !== item && i.sourceType !== 'pdf');
        let n = 1;
        for (const o of others) {
          $('decoAll').textContent = '적용 중… ' + (n + 1) + ' / ' + (others.length + 1);
          try { await applyTo(o, await baseFor(o), { ...JSON.parse(JSON.stringify(spec)), crop: { x: .5, y: .5, zoom: 1 } }, second); n++; } catch (_) {}
        }
        dialog.close(); render();
        toast(n + '장에 같은 꾸미기를 적용했어요.');
        return;
      }
      dialog.close();
      render();
      if (mode === 'save') {
        const s = await FileDelivery.save(r.blob, r.name);
        if (s.status === 'saved') toast(s.message || '꾸민 사진을 저장했어요.');
        else if (s.status === 'failed') toast(s.message || '저장하지 못했어요. 다시 시도해주세요.', true);
      } else toast('꾸미기를 적용했어요. 글씨를 넣거나 용량을 줄일 수 있어요.');
    } catch (e) { toast('꾸미기를 적용하지 못했어요. 다시 시도해주세요.', true); }
    finally { buttons.forEach(b => b.disabled = false); if ($('decoAll')) $('decoAll').textContent = '모든 사진에 적용'; }
  }


  function start() {
    const first = state.items.find(i => i.sourceType !== 'pdf') || state.items[0];
    if (first) { open(first); return; }
    pending = true; $('choose').click();
  }
  function afterAdd(newItems) { if (!pending) return; pending = false; if (newItems && newItems.length) open(newItems[0]); }
  window.PhotoSokDeco = Object.freeze({ open, start, afterAdd, compose, FILTERS, RATIOS });
})();
