// Scoreboard: the hook (bar 1), the persistent matchup HUD (bars 2-4), and the flip (bar 5).
import { CUE } from './cues.mjs';
import {
  E, glide, spring, track, norm, clamp, lerp, pulse, el, tf, vis, splitChars, noise1, css,
} from './core.mjs';

const TILE_W = 300;
const TILE_H = 160;
const GAP_X = 24;
const GAP_Y = 20;
const GRID_X = 66;
const GRID_Y = 950;

// Center column holds the two swing categories.
const CATS = [
  { k: 'PTS', mine: '1,046', opp: '1,012', win: true, share: 0.508 },
  { k: 'AST', mine: '404', opp: '409', win: false, share: 0.497, delta: '\u22125', flip: { mine: '418', opp: '409', delta: '+9', share: 0.505, at: CUE.flipAst } },
  { k: 'REB', mine: '402', opp: '388', win: true, share: 0.509 },
  { k: '3PM', mine: '72', opp: '79', win: false, share: 0.477 },
  { k: 'STL', mine: '56', opp: '58', win: false, share: 0.491, delta: '\u22122', flip: { mine: '61', opp: '58', delta: '+3', share: 0.513, at: CUE.flipStl } },
  { k: 'BLK', mine: '41', opp: '47', win: false, share: 0.466 },
  { k: 'FG%', mine: '.481', opp: '.472', win: true, share: 0.505 },
  { k: 'FT%', mine: '.792', opp: '.815', win: false, share: 0.493 },
  { k: 'TO', mine: '118', opp: '131', win: true, share: 0.53 },
];

export const tileCenter = (i) => ({
  x: GRID_X + (i % 3) * (TILE_W + GAP_X) + TILE_W / 2,
  y: GRID_Y + Math.floor(i / 3) * (TILE_H + GAP_Y) + TILE_H / 2,
});

// Build one face of a category tile with DOM nodes.
function buildFace(tile, side, { k, mine, opp, win, share, delta }) {
  const face = el('div', `face ${side}`, tile);
  el('div', 'cat', face).textContent = k;
  const flags = el('div', 'flags', face);
  if (delta) el('span', `delta ${win ? 'up' : 'down'}`, flags).textContent = delta;
  el('span', `badge ${win ? 'w' : 'l'}`, flags).textContent = win ? 'W' : 'L';
  const vals = el('div', 'vals num', face);
  el('span', 'mine', vals).textContent = mine;
  el('span', 'theirs', vals).textContent = `vs ${opp}`;
  const fill = el('i', '', el('div', 'bar', face));
  css(fill, {
    width: `${clamp(0.5 + (share - 0.5) * 5, 0.08, 0.92) * 100}%`,
    background: win ? 'var(--live)' : 'var(--loss)',
  });
  return face;
}

function roller(parent) {
  const box = el('span', 'digit', parent);
  const strip = el('span', 'strip', box);
  for (let i = 0; i <= 10; i += 1) el('span', '', strip).textContent = String(i % 10);
  return {
    box,
    set(v) {
      strip.style.transform = `translate3d(0, ${(-v).toFixed(4)}em, 0)`;
    },
  };
}

export function createScoreboard(root, fx) {
  const scene = el('div', 'scene', root);

  const eyebrow = el('div', 'abs sb-eyebrow eyebrow', scene);
  css(eyebrow, { top: '298px', fontSize: '30px' });
  eyebrow.innerHTML = '<span class="live"><i class="live-dot"></i>LIVE</span><span class="eb-text">2 NIGHTS LEFT</span>';
  const ebText = eyebrow.querySelector('.eb-text');
  const ebFlipped = el('span', 'eb-flip', eyebrow);
  css(ebFlipped, { position: 'absolute', left: '150px', color: 'var(--live)' });
  ebFlipped.textContent = 'ONE ADD · MATCHUP FLIPPED';

  const title = el('div', 'abs sb-title display', scene);
  css(title, { top: '346px', fontSize: '330px', transformOrigin: '0% 60%' });
  const line1 = el('div', 'sb-line', title);
  css(line1, { height: '278px', width: '980px' });
  const downWrap = el('div', 'roll', line1);
  const downChars = splitChars(downWrap, 'DOWN');
  const upWrap = el('div', 'roll', line1);
  upWrap.textContent = 'UP';
  css(upWrap, { color: 'var(--live)' });

  const line2 = el('div', 'sb-line', title);
  css(line2, { height: '278px', width: '980px', overflow: 'visible' });
  const record = el('div', 'sb-record num', line2);
  css(record, { transformOrigin: '0% 50%' });
  const mine = roller(record);
  const dash = el('span', '', record);
  css(dash, {
    display: 'inline-block', width: '0.2em', height: '0.075em', background: 'currentColor',
    margin: '0.56em 0.06em 0', borderRadius: '0.02em', verticalAlign: 'top',
  });
  const opp = roller(record);

  const tiles = CATS.map((cat, i) => {
    const tile = el('div', 'abs tile', scene);
    const { x, y } = tileCenter(i);
    css(tile, { left: `${x - TILE_W / 2}px`, top: `${y - TILE_H / 2}px`, width: `${TILE_W}px`, height: `${TILE_H}px` });
    const front = buildFace(tile, 'front', cat);
    const back = cat.flip ? buildFace(tile, 'back', { ...cat, ...cat.flip, win: true }) : null;
    const swing = cat.flip ? el('div', 'swing', tile) : null;
    const glow = el('div', '', tile);
    css(glow, {
      position: 'absolute', inset: '-2px', borderRadius: '26px', opacity: '0',
      boxShadow: '0 0 0 3px rgba(61, 204, 122, 0.9), 0 0 60px rgba(61, 204, 122, 0.45)',
    });
    const pop = cat.flip ? el('div', 'abs display', scene) : null;
    if (pop) {
      pop.textContent = `${cat.flip.delta} ${cat.k}`;
      const slotY = cat.k === 'AST' ? 668 : 776;
      css(pop, { left: '600px', top: `${slotY}px`, fontSize: '96px', color: 'var(--live)', textShadow: '0 0 40px rgba(61,204,122,0.5)', whiteSpace: 'nowrap', transformOrigin: '0% 50%' });
    }
    return { tile, front, back, swing, glow, pop, cat, i };
  });

  // HUD chip that carries the record through the ask, scan, and answer.
  const hud = el('div', 'abs hud', root);
  hud.innerHTML = '<i class="live-dot"></i><span class="rec">4-5</span><span class="sep"></span><span class="meta">2 NIGHTS LEFT</span>';
  const hudRec = hud.querySelector('.rec');
  css(hudRec, { color: 'var(--ink)' });

  // Measure the record and its HUD slot once, for the shared-element move between them.
  const stageRect = root.getBoundingClientRect();
  const recRect = record.getBoundingClientRect();
  const hudRect = hudRec.getBoundingClientRect();
  const flipTo = {
    x: hudRect.left - recRect.left,
    y: hudRect.top + hudRect.height / 2 - (recRect.top + recRect.height / 2),
    s: 34 / 330,
  };
  void stageRect;

  // Particle bursts at each flip, plus the UP slam.
  for (const t of tiles) {
    if (!t.cat.flip) continue;
    const c = tileCenter(t.i);
    fx.burst({ at: t.cat.flip.at + 0.22, x: c.x, y: c.y - 20, color: '#3dcc7a', count: 46, speed: 1300, seed: t.i * 7 + 3, size: 7 });
    fx.burst({ at: t.cat.flip.at + 0.22, x: c.x, y: c.y - 20, color: '#f3e2b0', count: 18, speed: 900, seed: t.i * 13 + 5, size: 5 });
  }
  fx.flash({ at: CUE.drop, color: '#fff8ea', strength: 0.42, decay: 12 });
  fx.flash({ at: CUE.upSlam, color: '#3dcc7a', strength: 0.22, decay: 6 });
  fx.burst({ at: CUE.upSlam, x: 300, y: 790, color: '#3dcc7a', count: 70, speed: 1700, seed: 99, size: 8, spread: Math.PI * 1.2 });

  function hook(t) {
    // Exit choreography: words and tiles clear first, then the record flies to the HUD.
    const clearAt = CUE.hookOut;
    const flyAt = CUE.hookOut + 0.02;
    const flyEnd = CUE.ask + 0.12;

    const eb = E.outCubic(norm(t, -0.1, 0.4));
    tf(eyebrow, { x: lerp(-60, 0, eb), o: eb * (1 - E.inCubic(norm(t, clearAt, clearAt + 0.4))) });
    vis(ebFlipped, false);
    ebText.style.opacity = '1';

    // DOWN rises out of its line mask, letter by letter, already moving on frame one.
    downChars.forEach((c, i) => {
      const s = -0.3 + i * 0.05;
      const p = E.outExpo(norm(t, s, s + 0.6));
      const leave = E.inCubic(norm(t, clearAt + i * 0.03, clearAt + 0.35 + i * 0.03));
      tf(c, { y: lerp(300, 0, p) - 300 * leave });
    });
    tf(upWrap, { y: 300 });
    tf(downWrap, {});

    const punchIn = 1 + 0.07 * (1 - E.outCubic(norm(t, 0, 1.2)));
    tf(title, { s: punchIn });

    // Record slams on beat one, then travels into the HUD.
    const slamStart = CUE.recordSlam - 0.07;
    const slam = spring(t - slamStart, { stiffness: 380, damping: 24 });
    const appear = norm(t, slamStart, slamStart + 0.08);
    const fp = glide(norm(t, flyAt, flyEnd));
    tf(record, {
      x: lerp(0, flipTo.x / punchIn, fp),
      y: lerp(0, flipTo.y / punchIn, fp),
      s: lerp(lerp(2.1, 1, slam), flipTo.s / punchIn, fp),
      o: appear * (1 - norm(fp, 0.9, 1)),
      blur: lerp(24, 0, E.outCubic(norm(t, slamStart, slamStart + 0.2))),
    });
    record.style.color = 'var(--ink)';
    record.style.textShadow = 'none';
    mine.set(4);
    opp.set(5);

    // Tiles flip up in reading order, then fold away before the record moves.
    tiles.forEach((tt) => {
      const s = CUE.tilesIn - 0.06 + tt.i * 0.06;
      const p = norm(t, s, s + 0.55);
      const swingOn = tt.cat.flip ? E.outCubic(norm(t, CUE.swing, CUE.swing + 0.35)) : 0;
      const dim = tt.cat.flip ? 1 : lerp(1, 0.4, E.outCubic(norm(t, CUE.swing, CUE.swing + 0.4)));
      const order = 8 - tt.i;
      const leave = E.inCubic(norm(t, clearAt - 0.1 + order * 0.02, clearAt + 0.22 + order * 0.02));
      const bump = tt.cat.flip ? 0.07 * pulse(t, CUE.swing, 7) * (t > CUE.swing ? 1 : 0) : 0;
      // Opacity lives on the faces: on the 3D container it would flatten the card.
      const o = E.outCubic(norm(t, s, s + 0.25)) * (1 - leave);
      tf(tt.tile, {
        rx: lerp(-100, 0, E.outBack(p, 1.3)) + leave * 85,
        y: lerp(70, 0, E.outCubic(p)) + leave * 60,
        s: 1 + bump - leave * 0.08,
      });
      tt.front.style.filter = 'none';
      tt.front.style.opacity = String(dim * o);
      if (tt.back) tt.back.style.opacity = String(o);
      if (tt.swing) tt.swing.style.opacity = String(swingOn * o);
      tt.glow.style.opacity = '0';
      if (tt.pop) vis(tt.pop, false);
    });
  }

  function flip(t) {
    const slam = E.outCubic(norm(t, CUE.drop, CUE.drop + 0.3));
    const exit = norm(t, CUE.flipOut, CUE.stream);
    const fly = E.inCubic(exit);
    vis(ebFlipped, t >= CUE.upSlam + 0.1);
    const ebSwap = E.outCubic(norm(t, CUE.upSlam + 0.1, CUE.upSlam + 0.5));
    ebText.style.opacity = String(1 - ebSwap);
    tf(ebFlipped, { y: lerp(40, 0, ebSwap), o: ebSwap });
    tf(eyebrow, { o: 1 - fly, y: -fly * 80 });

    const downOut = E.inExpo(norm(t, CUE.upSlam - 0.2, CUE.upSlam + 0.08));
    const upIn = E.outExpo(norm(t, CUE.upSlam, CUE.upSlam + 0.55));
    downChars.forEach((c) => tf(c, {}));
    tf(downWrap, { y: -300 * downOut });
    tf(upWrap, { y: 300 * (1 - upIn) });

    const shake = 14 * pulse(t, CUE.upSlam, 9);
    tf(title, {
      s: lerp(1.16, 1, slam) * (1 + 0.05 * pulse(t, CUE.upSlam, 10)) * (1 + fly * 1.6),
      x: noise1(t * 40, 11) * shake - fly * 180,
      y: noise1(t * 40, 12) * shake - fly * 200,
      o: 1 - E.inQuad(exit),
      blur: fly * 18,
    });

    const m = track(t, [[CUE.flipAst, 4], [CUE.flipAst + 0.5, 5, E.outBack], [CUE.flipStl, 5], [CUE.flipStl + 0.5, 6, E.outBack]]);
    const o = track(t, [[CUE.flipAst, 5], [CUE.flipAst + 0.5, 4, E.outBack], [CUE.flipStl, 4], [CUE.flipStl + 0.5, 3, E.outBack]]);
    mine.set(m);
    opp.set(o);
    const green = E.outCubic(norm(t, CUE.upSlam, CUE.upSlam + 0.4));
    record.style.color = green > 0 ? `rgb(${Math.round(lerp(244, 61, green))}, ${Math.round(lerp(241, 204, green))}, ${Math.round(lerp(232, 122, green))})` : 'var(--ink)';
    record.style.textShadow = green > 0 ? `0 0 ${Math.round(80 * green)}px rgba(61, 204, 122, ${0.45 * green})` : 'none';
    tf(record, { s: 1 + 0.08 * pulse(t, CUE.flipAst + 0.1, 9) + 0.08 * pulse(t, CUE.flipStl + 0.1, 9), o: 1, blur: 0 });

    tiles.forEach((tt) => {
      const stagger = tt.i * 0.008;
      const leave = E.inCubic(norm(t, CUE.flipOut - 0.06 + stagger, CUE.stream - 0.02));
      let rx = 0;
      let z = 0;
      if (tt.cat.flip) {
        const p = norm(t, tt.cat.flip.at, tt.cat.flip.at + 0.6);
        rx = 180 * E.outBack(p, 1.6);
        z = 90 * Math.sin(clamp(p * 1.4) * Math.PI);
        const glowA = pulse(t, tt.cat.flip.at + 0.22, 3.2) * (t > tt.cat.flip.at + 0.22 ? 1 : 0);
        tt.glow.style.opacity = String(Math.max(glowA, t > CUE.upSlam ? 0.55 : 0));
        if (tt.swing) tt.swing.style.opacity = String(1 - E.outCubic(norm(t, tt.cat.flip.at, tt.cat.flip.at + 0.3)));
        const popIn = norm(t, tt.cat.flip.at + 0.2, tt.cat.flip.at + 0.5);
        vis(tt.pop, popIn > 0 && leave < 1);
        if (popIn > 0) {
          tf(tt.pop, {
            x: lerp(-60, 0, E.outExpo(popIn)) - leave * 200,
            y: -leave * 160,
            s: lerp(1.5, 1, E.outExpo(popIn)) * (1 + leave * 0.6),
            o: clamp(popIn * 4) * (1 - E.inQuad(leave)),
            blur: lerp(14, 0, E.outCubic(popIn)) + leave * 16,
          });
        }
      } else {
        tt.glow.style.opacity = tt.cat.win ? String(0.35 * pulse(t, CUE.upSlam + 0.05 + tt.i * 0.02, 4) * (t > CUE.upSlam ? 1 : 0)) : '0';
      }
      const faceO = String(1 - E.inQuad(leave));
      tt.front.style.opacity = faceO;
      if (tt.back) tt.back.style.opacity = faceO;
      const faceBlur = leave > 0.01 ? `blur(${(leave * 14).toFixed(2)}px)` : 'none';
      tt.front.style.filter = faceBlur;
      if (tt.back) tt.back.style.filter = faceBlur;
      tt.glow.style.opacity = String(Number(tt.glow.style.opacity || 0) * (1 - leave));
      tf(tt.tile, {
        rx,
        z: z + 400 * leave,
        y: lerp(-24, 0, slam) + leave * 60,
        s: lerp(1.12, 1, slam) * (1 + leave * 0.5),
      });
    });
  }

  function hudUpdate(t) {
    const inP = E.outCubic(norm(t, CUE.ask - 0.1, CUE.ask + 0.4));
    const outP = E.inCubic(norm(t, CUE.suck, CUE.drop - 0.02));
    hud.style.clipPath = `inset(0 ${lerp(78, 0, inP)}% 0 0 round 999px)`;
    tf(hud, { o: clamp(inP * 3) * (1 - outP), y: -outP * 40 });
  }

  return {
    update(t) {
      const inHook = t < CUE.ask + 0.14;
      const inFlip = t >= CUE.drop && t < CUE.stream;
      vis(scene, inHook || inFlip);
      if (inHook) hook(t);
      else if (inFlip) flip(t);
      if (vis(hud, t >= CUE.ask - 0.12 && t < CUE.drop)) hudUpdate(t);
    },
  };
}
