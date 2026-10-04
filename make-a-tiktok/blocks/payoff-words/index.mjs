// A line that lands one word per beat, centered and wrapped, then clears before the next scene.
// Hold the full line at least 1.2 s after the last word lands; cues.out is when it is gone.
import { E, norm, clamp, lerp, el, css, tf, vis, ensureStyle, PACE } from '../../lib/core.mjs';

const STYLE = `
.b-payoff { left: 60px; width: 960px; display: flex; flex-wrap: wrap; justify-content: center; gap: 0 0.22em;
  color: var(--ink); text-align: center; }
.b-payoff > span { display: inline-block; }
`;

export function create(ctx, params = {}) {
  ensureStyle('payoff-words', STYLE);
  const { words = ['One', 'line', 'lands.'], cues = {}, layout = {}, accent = [], pace = {}, parent = ctx.ui } = params;
  const P = { ...PACE, ...pace };
  const { at = 0, step = 0.5, out = Infinity } = cues;
  const { top = 560, fontSize = 190 } = layout;
  const accented = new Set(accent);
  const root = el('div', 'abs display b-payoff', parent);
  css(root, { top: `${top}px`, fontSize: `${fontSize}px` });
  const spans = words.map((w, i) => {
    const s = el('span', '', root);
    s.textContent = w;
    if (accented.has(i)) css(s, { color: 'var(--accent)' });
    return s;
  });
  return {
    root,
    update(t) {
      if (!vis(root, t >= at - 0.1 && t < out + 0.02)) return;
      const leave = E.inCubic(norm(t, out - P.exit, out));
      spans.forEach((s, i) => {
        const wAt = at + i * step;
        const p = E.outQuart(norm(t, wAt - 0.06, wAt - 0.06 + P.enter));
        tf(s, { y: lerp(120, 0, p) - leave * 90, s: lerp(1.25, 1, p), blur: lerp(14, 0, p) + leave * 14, o: clamp((t - wAt + 0.06) * 6) * (1 - leave) });
      });
    },
  };
}

export const DEMO_LEN = 4;
export function demo(ctx) {
  return create(ctx, { words: ['One', 'word', 'on', 'every', 'beat.'], accent: [4], cues: { at: 0.2, step: 0.45, out: 3.9 } });
}
