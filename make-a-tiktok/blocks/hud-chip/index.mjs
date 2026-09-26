// A persistent HUD pill (live dot, a value such as a score, a separator, meta text) that wipes open
// from the left and keeps context on screen across scenes. Expose `value` as a flight target.
import { E, norm, clamp, lerp, el, css, tf, vis, setText, ensureStyle, PACE } from '../../lib/core.mjs';

const STYLE = `
.b-hud { display: flex; align-items: center; gap: 16px; padding: 16px 26px 16px 22px; border-radius: 999px;
  background: color-mix(in srgb, var(--panel) 92%, transparent); border: 2px solid var(--line); font-size: 30px; font-weight: 600; white-space: nowrap; }
.b-hud .val { font-size: 36px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--ink); }
.b-hud .sep { width: 2px; height: 30px; background: var(--line); }
.b-hud .meta { color: var(--muted); letter-spacing: 0.06em; text-transform: uppercase; }
`;

export function create(ctx, params = {}) {
  ensureStyle('hud-chip', STYLE);
  const { live = true, value = '', meta = '', layout = {}, cues = {}, pace = {}, parent = ctx.ui } = params;
  const P = { ...PACE, ...pace };
  const { left = 70, top = 250 } = layout;
  const c = { in: 0.2, out: Infinity, ...cues };
  const root = el('div', 'abs b-hud', parent);
  css(root, { left: `${left}px`, top: `${top}px` });
  if (live) el('i', 'live-dot', root);
  const valueEl = el('span', 'val', root);
  valueEl.textContent = value;
  if (meta) {
    el('span', 'sep', root);
    el('span', 'meta', root).textContent = meta;
  }
  return {
    root,
    value: valueEl,
    setValue: (v) => setText(valueEl, v),
    update(t) {
      if (!vis(root, t >= c.in - 0.03 && t < c.out)) return;
      const p = E.outCubic(norm(t, c.in - 0.03, c.in - 0.03 + P.enter));
      const out = E.inCubic(norm(t, c.out - P.exit, c.out - 0.02));
      root.style.clipPath = `inset(0 ${lerp(78, 0, p)}% 0 0 round 999px)`;
      tf(root, { o: clamp(p * 3) * (1 - out), y: -out * 40 });
    },
  };
}

export const DEMO_LEN = 2.5;
export function demo(ctx) {
  return create(ctx, { value: '4-5', meta: 'Week 18 · 2 nights left', cues: { in: 0.3, out: 2.45 }, layout: { top: 800 } });
}
