// Scoreboard: an eyebrow, a big word over a rolling record ("DOWN / 2-4"), and a grid of metric
// tiles with win/loss badges. Two modes:
//   enter: letters rise, the record slams, tiles flip up, swing tiles glow, then everything clears
//          (the record can fly into a HUD element).
//   flip:  the board smashes in, chosen tiles flip over to a new state one by one (split-flap
//          style) while the record rolls, callouts pop, and the word swaps ("DOWN" to "UP").
// Use two instances (enter for the hook, flip for the payoff) to tell a before/after story.
// Enter mode clears so that everything is gone by cues.out; give each flip about 0.7 s.
import { E, spring, norm, clamp, lerp, pulse, noise1, el, css, tf, vis, ensureStyle, PACE } from '../../lib/core.mjs';
import { splitChars, fitText } from '../../lib/kit.mjs';

const STYLE = `
.b-score .eb { display: flex; align-items: center; gap: 18px; font-size: 30px; }
.b-score .eb .live { color: var(--positive); display: inline-flex; align-items: center; gap: 12px; }
.b-score .title { color: var(--ink); white-space: nowrap; transform-origin: 0% 60%; }
.b-score .line { position: relative; overflow: hidden; }
.b-score .line > .w { position: absolute; left: 0; top: 0; }
.b-score .rec { display: flex; align-items: flex-start; transform-origin: 0% 50%; font-variant-numeric: tabular-nums; }
.b-score .dash { display: inline-block; width: 0.2em; height: 0.075em; background: currentColor; margin: 0.56em 0.06em 0; border-radius: 0.02em; }
.b-score .tile { position: absolute; transform-style: preserve-3d; }
.b-score .face { position: absolute; inset: 0; border-radius: 24px; background: var(--panel); border: 2px solid var(--line);
  padding: 18px; backface-visibility: hidden; overflow: hidden; }
.b-score .face.back { transform: rotateX(180deg); }
.b-score .cat { font-size: 30px; font-weight: 600; letter-spacing: 0.12em; color: var(--muted); }
.b-score .flags { position: absolute; right: 16px; top: 16px; display: flex; align-items: center; gap: 8px; }
.b-score .flags span { font-size: 26px; font-weight: 700; padding: 3px 12px; border-radius: 10px; font-variant-numeric: tabular-nums; }
.b-score .w-ok { color: var(--positive); background: color-mix(in srgb, var(--positive) 14%, transparent); }
.b-score .w-no { color: var(--negative); background: color-mix(in srgb, var(--negative) 14%, transparent); }
.b-score .w-close { color: var(--warning); background: color-mix(in srgb, var(--warning) 14%, transparent); }
.b-score .vals { margin-top: 10px; display: flex; align-items: baseline; justify-content: space-between; gap: 10px; white-space: nowrap; }
.b-score .mine { font-size: 58px; font-weight: 700; color: var(--ink); letter-spacing: -0.025em; font-variant-numeric: tabular-nums; }
.b-score .theirs { font-size: 25px; font-weight: 500; color: var(--muted); font-variant-numeric: tabular-nums; }
.b-score .bar { position: absolute; left: 18px; right: 18px; bottom: 20px; height: 8px; border-radius: 8px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
.b-score .bar > i { display: block; height: 100%; border-radius: 8px; }
.b-score .ring { position: absolute; inset: -2px; border-radius: 26px; opacity: 0; pointer-events: none; }
.b-score .ring.swing { border: 3px solid var(--warning); box-shadow: 0 0 40px color-mix(in srgb, var(--warning) 35%, transparent); }
.b-score .ring.glow { box-shadow: 0 0 0 3px var(--positive), 0 0 60px color-mix(in srgb, var(--positive) 45%, transparent); }
.b-score .callout { color: var(--positive); white-space: nowrap; transform-origin: 0% 50%; text-shadow: 0 0 40px color-mix(in srgb, var(--positive) 50%, transparent); }
`;

function buildFace(tile, side, { label, mine, opp, win, share = 0.5, delta }) {
  const face = el('div', `face ${side}`, tile);
  el('div', 'cat', face).textContent = label;
  const flags = el('div', 'flags', face);
  if (delta) el('span', win ? 'w-ok' : 'w-close', flags).textContent = delta;
  el('span', win ? 'w-ok' : 'w-no', flags).textContent = win ? 'W' : 'L';
  const vals = el('div', 'vals', face);
  el('span', 'mine', vals).textContent = mine;
  el('span', 'theirs', vals).textContent = `vs ${opp}`;
  const fill = el('i', '', el('div', 'bar', face));
  css(fill, { width: `${clamp(0.5 + (share - 0.5) * 5, 0.08, 0.92) * 100}%`, background: win ? 'var(--positive)' : 'var(--negative)' });
  return face;
}

// Multi-digit odometer for one number; returns set(value) with fractional rolling per column.
function numberRoller(parent, maxDigits) {
  const cols = Array.from({ length: maxDigits }, () => {
    const box = el('span', 'digit', parent);
    const strip = el('span', 'strip', box);
    for (let i = 0; i <= 10; i += 1) el('span', '', strip).textContent = String(i % 10);
    return { box, strip };
  });
  return (from, to, p) => {
    const a = String(Math.round(from)).padStart(maxDigits, '0');
    const b = String(Math.round(to)).padStart(maxDigits, '0');
    cols.forEach((c, i) => {
      const v = lerp(Number(a[i]), Number(b[i]), p);
      c.strip.style.transform = `translate3d(0, ${(-v).toFixed(4)}em, 0)`;
      const lead = (s) => s.length - String(Number(s)).length > i;
      const hidden = lerp(lead(a) ? 1 : 0, lead(b) ? 1 : 0, p);
      c.box.style.opacity = String(1 - hidden);
      c.box.style.width = `${(0.5 * (1 - hidden)).toFixed(3)}em`;
    });
  };
}

export function create(ctx, params = {}) {
  ensureStyle('scoreboard-flip', STYLE);
  const {
    mode = 'enter',
    eyebrow = {},
    word = { before: 'Down', after: 'Up' },
    record = [[4, 5], [6, 3]],
    tiles = [],
    callouts = true,
    layout = {},
    cues = {},
    flyTo = null,
    pace = {},
    parent = ctx.ui,
  } = params;
  const P = { ...PACE, ...pace };
  const L = { left: 62, eyebrowTop: 298, titleTop: 346, fontSize: 330, gridLeft: 66, gridTop: 950, tileW: 300, tileH: 160, gapX: 24, gapY: 20, calloutLeft: 600, ...layout };
  const c = mode === 'enter'
    ? { start: -0.22, slam: 0.5, tilesIn: 1.0, swing: 1.9, out: 3.6, ...cues }
    : { in: 0, flips: [0.6, 1.3], swap: 2.1, exit: 3.5, end: 3.9, ...cues };

  const root = el('div', 'scene b-score', parent);
  const eb = el('div', 'abs eyebrow eb', root);
  css(eb, { left: `${L.left + 8}px`, top: `${L.eyebrowTop}px` });
  if (eyebrow.live !== null) {
    const live = el('span', 'live', eb);
    el('i', 'live-dot', live);
    el('span', '', live).textContent = eyebrow.live ?? 'Live';
  }
  const ebText = el('span', '', eb);
  ebText.textContent = eyebrow.text ?? '';
  const ebFlip = el('span', '', eb);
  css(ebFlip, { position: 'absolute', left: eyebrow.live === null ? '0' : '150px', color: 'var(--positive)' });
  ebFlip.textContent = eyebrow.flipped ?? '';

  const title = el('div', 'abs display title', root);
  // Wide display fonts would overflow at the default size: fit the widest word or record first.
  const widest = [word.before ?? '', word.after ?? '', ...record.map((r) => r.join('-'))].reduce((a, b) => (b.length > a.length ? b : a), '');
  const probe = el('div', 'abs display', root);
  probe.textContent = widest;
  L.fontSize = Math.round(fitText(probe, 1080 - L.left - 60, L.fontSize));
  probe.remove();
  css(title, { left: `${L.left}px`, top: `${L.titleTop}px`, fontSize: `${L.fontSize}px` });
  const lineH = Math.round(L.fontSize * 0.843);
  const line1 = el('div', 'line', title);
  css(line1, { height: `${lineH}px`, width: '980px' });
  const before = el('div', 'w', line1);
  const beforeChars = splitChars(before, word.before ?? '');
  const after = el('div', 'w', line1);
  after.textContent = word.after ?? '';
  css(after, { color: 'var(--positive)' });
  const line2 = el('div', 'line', title);
  css(line2, { height: `${lineH}px`, width: '980px', overflow: 'visible' });
  const rec = el('div', 'rec', line2);
  const nums = record[0].length;
  const rollers = Array.from({ length: nums }, (_, n) => {
    const maxDigits = Math.max(...record.map((r) => String(r[n]).length));
    const set = numberRoller(rec, maxDigits);
    if (n < nums - 1) el('span', 'dash', rec);
    return set;
  });

  const flipTiles = [];
  const tileEls = tiles.map((tileData, i) => {
    const tile = el('div', 'tile', root);
    css(tile, {
      left: `${L.gridLeft + (i % 3) * (L.tileW + L.gapX)}px`,
      top: `${L.gridTop + Math.floor(i / 3) * (L.tileH + L.gapY)}px`,
      width: `${L.tileW}px`,
      height: `${L.tileH}px`,
    });
    const front = buildFace(tile, 'front', tileData);
    const back = tileData.flip ? buildFace(tile, 'back', { ...tileData, ...tileData.flip, win: true }) : null;
    const swing = tileData.flip ? el('div', 'ring swing', tile) : null;
    const glow = el('div', 'ring glow', tile);
    let callout = null;
    if (tileData.flip && callouts && mode === 'flip') {
      callout = el('div', 'abs display callout', root);
      callout.textContent = `${tileData.flip.delta ?? ''} ${tileData.label}`.trim();
      css(callout, { left: `${L.calloutLeft}px`, top: `${L.titleTop + lineH + 40 + flipTiles.length * 108}px`, fontSize: '96px' });
    }
    const entry = { tile, front, back, swing, glow, callout, data: tileData, i, flipAt: null };
    if (tileData.flip) {
      entry.flipAt = c.flips?.[flipTiles.length] ?? null;
      flipTiles.push(entry);
    }
    return entry;
  });

  if (mode === 'flip') {
    ctx.fx.flash({ at: c.in, color: '#fff8ea', strength: 0.42, decay: 12 });
    flipTiles.forEach((ft, k) => {
      if (ft.flipAt === null) return;
      const x = L.gridLeft + (ft.i % 3) * (L.tileW + L.gapX) + L.tileW / 2;
      const y = L.gridTop + Math.floor(ft.i / 3) * (L.tileH + L.gapY) + L.tileH / 2 - 20;
      ctx.fx.burst({ at: ft.flipAt + 0.22, x, y, color: ctx.brand.tokens?.positive ?? '#3dcc7a', count: 46, speed: 1300, seed: 17 + k * 7, size: 7 });
    });
    if (c.swap !== null) {
      ctx.fx.flash({ at: c.swap, color: ctx.brand.tokens?.positive ?? '#3dcc7a', strength: 0.2, decay: 6 });
      ctx.fx.burst({ at: c.swap, x: 300, y: L.titleTop + lineH * 1.5, color: ctx.brand.tokens?.positive ?? '#3dcc7a', count: 70, speed: 1700, seed: 99, size: 8, spread: Math.PI * 1.2 });
    }
  }

  // Shared-element flight target for the record (enter mode).
  let flight = null;
  const measureFlight = () => {
    if (!flyTo) return null;
    const r = rec.getBoundingClientRect();
    const h = flyTo.getBoundingClientRect();
    const size = parseFloat(getComputedStyle(flyTo).fontSize) || 34;
    return { x: h.left - r.left, y: h.top + h.height / 2 - (r.top + r.height / 2), s: size / L.fontSize };
  };

  function recordAt(t) {
    // Record state index advances at each flip time with an overshooting roll.
    let from = record[0];
    let to = record[0];
    let p = 1;
    (c.flips ?? []).forEach((at, i) => {
      if (mode !== 'flip' || !record[i + 1] || t < at) return;
      from = record[i];
      to = record[i + 1];
      p = E.outBack(norm(t, at, at + 0.5));
    });
    rollers.forEach((set, n) => set(from[n], to[n], p));
  }

  function enter(t) {
    if (flight === null) flight = measureFlight() ?? false;
    // Everything leaves over the last P.exit + 0.2 s before cues.out (the flight takes 0.5 s).
    const clearAt = c.out - P.exit - (flight ? 0.1 : 0.2);
    const eIn = E.outCubic(norm(t, c.start + 0.22, c.start + 0.54));
    tf(eb, { x: lerp(-60, 0, eIn), o: eIn * (1 - E.inCubic(norm(t, clearAt, clearAt + P.exit))) });
    vis(ebFlip, false);
    beforeChars.forEach((ch, i) => {
      const s = c.start + i * 0.045;
      const p = E.outExpo(norm(t, s, s + 0.55));
      const leave = E.inCubic(norm(t, clearAt + i * 0.02, clearAt + P.exit - 0.1 + i * 0.02));
      tf(ch, { y: lerp(300, 0, p) - 300 * leave });
    });
    tf(after, { y: 300 });
    const punchIn = 1 + 0.07 * (1 - E.outCubic(norm(t, 0, 0.9)));
    tf(title, { s: punchIn });
    const slamStart = c.slam - 0.07;
    const k = spring(t - slamStart, { stiffness: 380, damping: 24 });
    const fly = flight ? E.inOutCubic(norm(t, clearAt, clearAt + 0.5)) : 0;
    const vanish = flight ? norm(fly, 0.9, 1) : E.inCubic(norm(t, clearAt, clearAt + P.exit));
    tf(rec, {
      x: flight ? lerp(0, flight.x / punchIn, fly) : 0,
      y: flight ? lerp(0, flight.y / punchIn, fly) : -200 * vanish,
      s: lerp(lerp(2.1, 1, k), flight ? flight.s / punchIn : 1, fly),
      o: norm(t, slamStart, slamStart + 0.08) * (1 - vanish),
      blur: lerp(24, 0, E.outCubic(norm(t, slamStart, slamStart + 0.2))),
    });
    css(rec, { color: 'var(--ink)', textShadow: 'none' });
    recordAt(t);
    tileEls.forEach((tt) => {
      const s = c.tilesIn - 0.06 + tt.i * 0.06;
      const p = norm(t, s, s + 0.55);
      const swingOn = tt.swing ? E.outCubic(norm(t, c.swing, c.swing + 0.35)) : 0;
      const dim = tt.swing || c.swing === null ? 1 : lerp(1, 0.4, E.outCubic(norm(t, c.swing, c.swing + 0.4)));
      const leave = E.inCubic(norm(t, clearAt + (tileEls.length - 1 - tt.i) * 0.02, clearAt + P.exit - 0.1 + (tileEls.length - 1 - tt.i) * 0.02));
      const bump = tt.swing ? 0.07 * pulse(t, c.swing, 7) * (t > c.swing ? 1 : 0) : 0;
      // Opacity lives on the faces: on the 3D tile it would flatten the flip.
      const o = E.outCubic(norm(t, s, s + 0.25)) * (1 - leave);
      tf(tt.tile, { rx: lerp(-100, 0, E.outBack(p, 1.3)) + leave * 85, y: lerp(70, 0, E.outCubic(p)) + leave * 60, s: 1 + bump - leave * 0.08 });
      tt.front.style.opacity = String(dim * o);
      if (tt.back) tt.back.style.opacity = String(o);
      if (tt.swing) tt.swing.style.opacity = String(swingOn * o);
      tt.glow.style.opacity = '0';
    });
  }

  function flip(t) {
    const slam = E.outCubic(norm(t, c.in, c.in + 0.45));
    const exit = norm(t, c.exit, c.end);
    const fly = E.inCubic(exit);
    const swapped = c.swap !== null && t >= c.swap + 0.05;
    vis(ebFlip, swapped);
    const ebSwap = c.swap === null ? 0 : E.outCubic(norm(t, c.swap + 0.05, c.swap + 0.45));
    ebText.style.opacity = String(1 - ebSwap);
    tf(ebFlip, { y: lerp(40, 0, ebSwap), o: ebSwap });
    tf(eb, { o: 1 - fly, y: -fly * 80 });
    beforeChars.forEach((ch) => tf(ch, {}));
    const downOut = c.swap === null ? 0 : E.inExpo(norm(t, c.swap - 0.2, c.swap + 0.08));
    const upIn = c.swap === null ? 0 : E.outExpo(norm(t, c.swap, c.swap + 0.55));
    tf(before, { y: -300 * downOut });
    tf(after, { y: 300 * (1 - upIn) });
    const shake = 14 * (c.swap === null ? 0 : pulse(t, c.swap, 9));
    tf(title, {
      s: lerp(1.16, 1, slam) * (1 + 0.05 * (c.swap === null ? 0 : pulse(t, c.swap, 10))) * (1 + fly * 1.6),
      x: noise1(t * 40, 11) * shake - fly * 180,
      y: noise1(t * 40, 12) * shake - fly * 200,
      o: 1 - E.inQuad(exit),
      blur: fly * 18,
    });
    recordAt(t);
    const green = c.swap === null ? 0 : E.outCubic(norm(t, c.swap, c.swap + 0.4));
    css(rec, {
      color: green > 0 ? `color-mix(in srgb, var(--positive) ${Math.round(green * 100)}%, var(--ink))` : 'var(--ink)',
      textShadow: green > 0 ? `0 0 ${Math.round(80 * green)}px color-mix(in srgb, var(--positive) ${Math.round(45 * green)}%, transparent)` : 'none',
    });
    const bumps = (c.flips ?? []).reduce((acc, at) => acc + 0.08 * pulse(t, at + 0.1, 9) * (t > at ? 1 : 0), 0);
    tf(rec, { s: 1 + bumps, o: 1, blur: 0 });
    tileEls.forEach((tt) => {
      const leave = E.inCubic(norm(t, c.exit - 0.06 + tt.i * 0.008, c.end - 0.02));
      let rx = 0;
      let z = 0;
      if (tt.flipAt !== null) {
        const p = norm(t, tt.flipAt, tt.flipAt + 0.6);
        rx = 180 * E.outBack(p, 1.6);
        z = 90 * Math.sin(clamp(p * 1.4) * Math.PI);
        const glowA = pulse(t, tt.flipAt + 0.16, 3.2) * (t > tt.flipAt + 0.16 ? 1 : 0);
        tt.glow.style.opacity = String(Math.max(glowA, swapped ? 0.55 : 0) * (1 - leave));
        if (tt.swing) tt.swing.style.opacity = String(1 - E.outCubic(norm(t, tt.flipAt, tt.flipAt + 0.3)));
        if (tt.callout) {
          const popIn = norm(t, tt.flipAt + 0.2, tt.flipAt + 0.5);
          vis(tt.callout, popIn > 0 && leave < 1);
          if (popIn > 0) {
            tf(tt.callout, { x: lerp(-60, 0, E.outExpo(popIn)) - leave * 200, y: -leave * 160, s: lerp(1.5, 1, E.outExpo(popIn)) * (1 + leave * 0.6), o: clamp(popIn * 4) * (1 - E.inQuad(leave)), blur: lerp(14, 0, E.outCubic(popIn)) + leave * 16 });
          }
        }
      } else {
        tt.glow.style.opacity = tt.data.win && swapped ? String(0.35 * pulse(t, c.swap + 0.05 + tt.i * 0.02, 4)) : '0';
        if (tt.swing) tt.swing.style.opacity = '0';
      }
      const faceO = String(1 - E.inQuad(leave));
      const faceBlur = leave > 0.01 ? `blur(${(leave * 14).toFixed(2)}px)` : 'none';
      for (const f of [tt.front, tt.back]) {
        if (!f) continue;
        f.style.opacity = faceO;
        f.style.filter = faceBlur;
      }
      tf(tt.tile, { rx, z: z + 400 * leave, y: lerp(-24, 0, slam) + leave * 60, s: lerp(1.12, 1, slam) * (1 + leave * 0.5) });
    });
  }

  return {
    root,
    record: rec,
    update(t) {
      const on = mode === 'enter' ? t < c.out + 0.02 : t >= c.in && t < c.end;
      if (!vis(root, on)) return;
      if (mode === 'enter') enter(t);
      else flip(t);
    },
  };
}

const DEMO_TILES = [
  { label: 'ALPHA', mine: '1,046', opp: '1,012', win: true, share: 0.508 },
  { label: 'BETA', mine: '404', opp: '409', win: false, share: 0.497, delta: '−5', flip: { mine: '418', opp: '409', delta: '+9', share: 0.505 } },
  { label: 'GAMMA', mine: '402', opp: '388', win: true, share: 0.509 },
  { label: 'DELTA', mine: '72', opp: '79', win: false, share: 0.477 },
  { label: 'SIGMA', mine: '56', opp: '58', win: false, share: 0.491, delta: '−2', flip: { mine: '61', opp: '58', delta: '+3', share: 0.513 } },
  { label: 'OMEGA', mine: '41', opp: '47', win: false, share: 0.466 },
];

export const DEMO_LEN = 4.2;
export function demo(ctx) {
  return create(ctx, {
    mode: 'flip',
    eyebrow: { live: 'Live', text: 'This week', flipped: 'Result flipped' },
    word: { before: 'Down', after: 'Up' },
    record: [[2, 4], [3, 3], [4, 2]],
    tiles: DEMO_TILES,
    cues: { in: 0.1, flips: [0.6, 1.3], swap: 2.1, exit: 3.5, end: 4.0 },
  });
}
