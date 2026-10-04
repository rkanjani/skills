// Rapid-fire words, one per beat, each with outlined echoes stacked above and below and an
// optional mini card built by the caller. Entrances alternate (zoom, right, left, up); each word
// exits in the direction of the next entrance so the sequence reads as one whip.
import { E, spring, norm, clamp, lerp, pulse, el, css, tf, vis, ensureStyle, PACE } from '../../lib/core.mjs';
import { fitText } from '../../lib/kit.mjs';

const STYLE = `
.b-montage .word { left: 0; width: 1080px; text-align: center; color: var(--ink); white-space: nowrap; }
.b-montage .word.outline { color: transparent; }
.b-montage .card { left: 120px; width: 840px; padding: 26px 30px; }
`;

export function create(ctx, params = {}) {
  ensureStyle('word-montage', STYLE);
  const { items = [], end = Infinity, echoes = true, layout = {}, pace = {}, parent = ctx.ui } = params;
  const P = { ...PACE, ...pace };
  const { wordTop = 560, cardTop = 1010, maxSize = 330, maxWidth = 900 } = layout;
  const root = el('div', 'scene b-montage', parent);
  const beats = items.map((item, i) => {
    const group = el('div', 'layer', root);
    const ech = echoes ? [-2, -1, 1, 2].map((k) => {
      const e = el('div', 'abs word display outline', group);
      e.textContent = item.word;
      return { e, k };
    }) : [];
    const word = el('div', 'abs word display', group);
    word.textContent = item.word;
    const size = fitText(word, maxWidth, item.maxSize ?? maxSize);
    ech.forEach(({ e }) => css(e, { fontSize: `${size}px` }));
    let card = null;
    if (item.card) {
      card = el('div', 'abs card panel', group);
      item.card(card, ctx);
    }
    return { ...item, group, word, ech, card, size, mode: item.mode ?? ['zoom', 'right', 'left', 'up'][i % 4] };
  });

  return {
    root,
    update(t) {
      if (!vis(root, beats.length > 0 && t >= beats[0].at - 0.25 && t < end)) return;
      beats.forEach((b, i) => {
        const last = i === beats.length - 1;
        const next = beats[i + 1]?.at ?? end;
        if (!vis(b.group, t >= b.at - 0.06 && t < next + (last ? 0 : 0.03))) return;
        const p = norm(t, b.at - 0.06, b.at + 0.32);
        const k = E.outExpo(p);
        const outP = last ? 0 : E.inCubic(norm(t, next - 0.2, next + 0.02));
        const push = last ? E.inCubic(norm(t, next - P.exit, next)) : 0;
        let x = 0;
        let y = 0;
        let s = 1;
        let skx = 0;
        let blur = 0;
        if (b.mode === 'zoom') {
          s = lerp(1.9, 1, k);
          blur = lerp(26, 0, k);
        } else if (b.mode === 'right' || b.mode === 'left') {
          const dir = b.mode === 'right' ? 1 : -1;
          x = lerp(900 * dir, 0, k);
          skx = lerp(-24 * dir, 0, k);
          blur = lerp(20, 0, k);
        } else {
          y = lerp(420, 0, k);
          blur = lerp(20, 0, k);
        }
        const nextMode = beats[i + 1]?.mode;
        const exitDir = last ? 0 : nextMode === 'right' ? -1 : nextMode === 'left' ? 1 : 0;
        x += exitDir * 700 * outP;
        y += (exitDir === 0 ? -320 : 0) * outP;
        s *= 1 - 0.12 * outP;
        blur += 18 * outP + push * 6;
        const hit = pulse(t, b.at, 11) * (t >= b.at ? 1 : 0);
        const drift = (t - b.at) * -40;
        tf(b.word, { x, y: wordTop + y + drift, s: s * (1 + 0.06 * hit + 0.22 * push), skx, blur, o: clamp(p * 4) * (1 - outP) });
        const spread = 1 + 0.12 * (1 - k);
        b.ech.forEach(({ e, k: off }) => {
          tf(e, { x: x * (1 + Math.abs(off) * 0.15), y: wordTop + y + off * b.size * 0.86 * spread + drift * (1 + Math.abs(off) * 0.4), s, skx, blur: blur * 1.2, o: (0.55 / Math.abs(off)) * clamp(norm(t, b.at, b.at + 0.36)) * (1 - outP) });
        });
        if (b.card) {
          const cp = spring(t - b.at + 0.03, { stiffness: 200, damping: 22 });
          const cx = b.mode === 'right' ? lerp(700, 0, cp) : b.mode === 'left' ? lerp(-700, 0, cp) : 0;
          const cy = b.mode === 'up' ? lerp(300, 0, cp) : b.mode === 'zoom' ? lerp(140, 0, cp) : 0;
          tf(b.card, { x: cx + exitDir * 820 * outP, y: cardTop + cy - (exitDir === 0 ? 260 : 0) * outP, s: (b.mode === 'zoom' ? lerp(0.86, 1, cp) : 1) * (1 - 0.08 * outP), blur: blur * 0.6 + 14 * outP, o: clamp((t - b.at + 0.05) * 5) * (1 - outP) });
        }
      });
    },
  };
}

export const DEMO_LEN = 4.2;
export function demo(ctx) {
  const line = (text) => (card) => {
    const d = el('div', '', card);
    d.textContent = text;
    css(d, { fontSize: '36px', fontWeight: '600' });
  };
  return create(ctx, {
    items: [
      { word: 'Plan.', at: 0.2, card: line('A short proof line') },
      { word: 'Track.', at: 1.2, card: line('Another short line') },
      { word: 'Share.', at: 2.2, card: line('One more line') },
      { word: 'Just ask.', at: 3.2 },
    ],
    end: 4.15,
  });
}
