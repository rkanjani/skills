// Funnel counter: a big number that counts up to the pool size, then drops through a mask to each
// smaller value with a two-line label hugging it ("214 / options" to "1 / best pick").
import { E, norm, clamp, lerp, pulse, el, css, tf, vis, ensureStyle, PACE } from '../../lib/core.mjs';
import { slotNumber } from '../../lib/kit.mjs';

const STYLE = `
.b-funnel .lbl { position: absolute; left: 0; top: 0; white-space: nowrap; font-weight: 700; letter-spacing: 0; }
`;

export function create(ctx, params = {}) {
  ensureStyle('funnel-counter', STYLE);
  const { steps = [], cues = {}, layout = {}, countUp = true, pace = {}, parent = ctx.ui } = params;
  const P = { ...PACE, ...pace };
  const { left = 70, top = 1300, fontSize = 250, labelSize = 62 } = layout;
  const c = { in: steps[0]?.at ?? 0, out: Infinity, ...cues };

  const root = el('div', 'abs b-funnel', parent);
  css(root, { left: '0', top: `${top}px`, width: '1080px', height: `${fontSize}px` });
  const slot = slotNumber(root, { fontSize, height: Math.round(fontSize * 0.93) });
  css(slot.mask, { left: `${left}px` });
  const labelMask = el('div', 'abs', root);
  css(labelMask, { top: `${Math.round(fontSize * 0.24)}px`, height: `${Math.round(labelSize * 1.9)}px`, width: '640px', overflow: 'hidden' });
  const labels = steps.map((s) => {
    const l = el('div', 'display lbl', labelMask);
    const [a, b] = Array.isArray(s.label) ? s.label : [s.label, ''];
    el('div', '', l).textContent = a;
    if (b) el('div', '', l).textContent = b;
    css(l, { fontSize: `${labelSize}px`, lineHeight: `${Math.round(labelSize * 0.94)}px`, color: s.tone === 'positive' ? 'var(--positive)' : 'var(--accent)' });
    return l;
  });

  return {
    root,
    update(t) {
      if (!vis(root, t >= c.in - 0.1 && t < c.out)) return;
      const inP = E.outCubic(norm(t, c.in - 0.05, c.in - 0.05 + P.enter));
      const out = E.inCubic(norm(t, c.out - P.exit, c.out));
      tf(root, { o: inP * (1 - out), y: lerp(80, 0, inP) + out * 60 });
      let i = -1;
      steps.forEach((s, k) => {
        if (t >= s.at) i = k;
      });
      const step = steps[Math.max(0, i)];
      let width;
      if (i <= 0 && countUp) {
        const v = Math.round(step.value * E.outCubic(norm(t, steps[0].at, steps[0].at + 0.6)));
        width = slot.set(v, v, 1);
      } else {
        const q = E.outExpo(norm(t, step.at, step.at + 0.45));
        width = slot.set(i > 0 ? steps[i - 1].value : step.value, step.value, i >= 0 ? q : 1);
      }
      const positive = step.tone === 'positive' && t >= step.at;
      css(slot.cur, { color: positive ? 'var(--positive)' : 'var(--ink)', textShadow: positive ? `0 0 ${Math.round(70 * clamp((t - step.at) * 5))}px color-mix(in srgb, var(--positive) 55%, transparent)` : 'none' });
      tf(slot.mask, { s: 1 + (i >= 1 ? 0.07 * pulse(t, step.at + 0.05, 9) : 0) });
      slot.mask.style.transformOrigin = '0% 60%';
      labelMask.style.left = `${(left + width + 34).toFixed(1)}px`;
      labels.forEach((l, k) => {
        const at = steps[k].at;
        const next = steps[k + 1]?.at ?? Infinity;
        const pin = E.outExpo(norm(t, at, at + 0.45));
        const pout = E.outExpo(norm(t, next, next + 0.45));
        vis(l, t >= at && pout < 1);
        tf(l, { y: lerp(120, 0, pin) - 120 * pout });
      });
    },
  };
}

export const DEMO_LEN = 4.4;
export function demo(ctx) {
  return create(ctx, {
    steps: [
      { at: 0.2, value: 214, label: ['All', 'options'] },
      { at: 1.2, value: 38, label: ['First', 'filter'] },
      { at: 2.2, value: 3, label: ['Second', 'filter'] },
      { at: 3.2, value: 1, label: ['Best', 'pick'], tone: 'positive' },
    ],
    layout: { top: 800 },
  });
}
