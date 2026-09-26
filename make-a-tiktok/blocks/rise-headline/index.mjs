// Hook headline: an eyebrow plus 1 to 3 display lines whose letters rise out of masks. The last
// line can slam on a beat. Frame 0 is already mid-rise so the thumbnail carries the hook.
// cues.out is when the headline is fully gone; hold it at least 2 s after the slam.
import { E, spring, norm, lerp, el, css, tf, vis, ensureStyle, PACE } from '../../lib/core.mjs';
import { splitChars, riseChars, fitText } from '../../lib/kit.mjs';

const STYLE = `
.b-rise { position: absolute; transform-origin: 0% 60%; }
.b-rise.center { text-align: center; transform-origin: 50% 60%; }
.b-rise .eb { display: flex; align-items: center; gap: 16px; font-size: 30px; margin-bottom: 22px; }
.b-rise.center .eb { justify-content: center; }
.b-rise .line { position: relative; overflow: hidden; }
.b-rise .line > div { white-space: nowrap; }
`;

export function create(ctx, params = {}) {
  ensureStyle('rise-headline', STYLE);
  const {
    lines = ['Your', 'hook.'],
    eyebrow = '',
    dot = true,
    align = 'left',
    color = 'var(--ink)',
    accentLast = false,
    layout = {},
    cues = {},
    pace = {},
    parent = ctx.ui,
  } = params;
  const P = { ...PACE, ...pace };
  const { left = align === 'center' ? 60 : 66, top = 300, width = 960, maxSize = 330 } = layout;
  const { start = -0.4, slam = null, out = null } = cues;
  // Exits start early enough that the last letter is gone by `out`.
  const leaveAt = out === null ? null : out - P.exit - 0.12;

  const root = el('div', `b-rise ${align === 'center' ? 'center' : ''}`, parent);
  css(root, { left: `${left}px`, top: `${top}px`, width: `${width}px` });
  const eb = eyebrow ? el('div', 'eyebrow eb', root) : null;
  if (eb) {
    if (dot) el('i', 'live-dot', eb);
    el('span', '', eb).textContent = eyebrow;
  }
  const title = el('div', 'display', root);
  css(title, { color });
  const rows = lines.map((text, i) => {
    const line = el('div', 'line', title);
    const inner = el('div', '', line);
    if (accentLast && i === lines.length - 1) css(inner, { color: 'var(--accent)' });
    return { line, inner, chars: splitChars(inner, text) };
  });
  const size = Math.min(...rows.map((r) => fitText(r.inner, width - 20, maxSize)));
  rows.forEach((r) => {
    css(r.inner, { fontSize: `${size}px` });
    css(r.line, { height: `${Math.round(size * 0.86)}px` });
  });

  return {
    root,
    size,
    update(t) {
      const until = out === null ? Infinity : out + 0.02;
      if (!vis(root, t < until)) return;
      if (eb) {
        const p = E.outCubic(norm(t, start + 0.2, start + 0.5));
        const leave = out === null ? 0 : E.inCubic(norm(t, leaveAt, leaveAt + P.exit));
        tf(eb, { x: lerp(-60, 0, p), o: p * (1 - leave) });
      }
      rows.forEach((r, i) => {
        const last = i === rows.length - 1 && slam !== null && rows.length > 1;
        const s = last ? slam - 0.09 : start + i * 0.12;
        riseChars(r.chars, t, s, { stagger: last ? 0.03 : 0.05, dur: last ? 0.42 : 0.7, exitAt: leaveAt === null ? null : leaveAt + i * 0.04, exitDur: P.exit - 0.08 });
        if (last) {
          const k = spring(t - (slam - 0.07), { stiffness: 380, damping: 24 });
          tf(r.inner, { s: t < slam - 0.07 ? 1 : lerp(1.6, 1, k), blur: lerp(18, 0, E.outCubic(norm(t, slam - 0.07, slam + 0.16))) });
        }
      });
      tf(root, { s: 1 + 0.06 * (1 - E.outCubic(norm(t, 0, 0.9))) });
    },
  };
}

export const DEMO_LEN = 4;
export function demo(ctx) {
  return create(ctx, { lines: ['Down', '4-5.'], eyebrow: 'Live · 2 nights left', cues: { start: 0.1, slam: 1.0, out: 3.8 } });
}
