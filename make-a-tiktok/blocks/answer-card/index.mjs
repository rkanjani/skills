// Recommendation card plus AI answer: the card opens with a circular reveal from a point (for
// example a dot in the world), its rows cascade in, the AI answer streams word by word with tags,
// and a tap presses the primary action, which wipes to a confirmed state.
import { E, spring, norm, clamp, lerp, el, css, tf, vis, icon, ensureStyle, PACE } from '../../lib/core.mjs';
import { streamWords, pressScale, tapAt } from '../../lib/kit.mjs';

const STYLE = `
.b-answer { padding: 34px 36px 36px; transform-origin: 50% 50%; }
.b-answer .top { display: flex; align-items: center; justify-content: space-between; }
.b-answer .who { display: flex; align-items: center; gap: 28px; margin-top: 30px; }
.b-answer .avatar { display: grid; place-items: center; width: 132px; height: 132px; flex: none; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, var(--panel2), var(--panel)); border: 3px solid color-mix(in srgb, var(--positive) 70%, transparent);
  font-family: var(--font-display); font-weight: 800; font-size: 58px; color: var(--ink); }
.b-answer .name { font-size: 66px; font-weight: 700; letter-spacing: -0.01em; }
.b-answer .meta { font-size: 34px; color: var(--muted); margin-top: 4px; }
.b-answer .gains { margin-left: auto; text-align: right; }
.b-answer .gain { font-size: 52px; font-weight: 700; color: var(--positive); font-variant-numeric: tabular-nums; }
.b-answer .gain.small { font-size: 36px; font-weight: 600; margin-top: 4px; }
.b-answer .actions { display: flex; gap: 16px; margin-top: 34px; }
.b-answer .primary { position: relative; flex: 1; overflow: hidden; }
.b-answer .done { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 14px;
  background: var(--positive); color: var(--bg); }
.b-answer .tint { position: absolute; inset: 0; border-radius: calc(var(--radius) - 2px); background: var(--positive); pointer-events: none; }
.b-answer-ai { padding: 30px 34px 34px; border-radius: 30px 30px 30px 8px; background: var(--panel2); border: 2px solid var(--line);
  box-shadow: 0 40px 100px rgba(0, 0, 0, 0.45); }
.b-answer-ai .by { display: flex; align-items: center; gap: 12px; font-size: 28px; font-weight: 600; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--accent); }
.b-answer-ai .text { margin-top: 16px; font-size: 44px; line-height: 1.36; color: var(--ink); min-height: 110px; }
.b-answer-ai .tags { display: flex; gap: 12px; margin-top: 22px; }
`;

export function create(ctx, params = {}) {
  ensureStyle('answer-card', STYLE);
  const {
    card = {},
    ai = null,
    layout = {},
    cues = {},
    origin = null,
    burst = true,
    pace = {},
    parent = ctx.ui,
  } = params;
  const P = { ...PACE, ...pace };
  const {
    eyebrow = 'Best pick', badge = '', avatar = '', name = '', meta = '', gains = [], primary = 'Add', done = 'Added', secondary = '',
  } = card;
  const { left = 70, top = 420, width = 940, aiTop = 900 } = layout;
  const c = { reveal: 0.3, answer: 0.9, tags: 2.4, press: 3.2, out: Infinity, ...cues };

  const root = el('div', 'abs panel b-answer', parent);
  css(root, { left: `${left}px`, top: `${top}px`, width: `${width}px` });
  const rows = [];
  const top1 = el('div', 'top', root);
  el('span', 'eyebrow', top1).textContent = eyebrow;
  if (badge) el('span', 'pill good num', top1).textContent = badge;
  rows.push(top1);
  const who = el('div', 'who', root);
  if (avatar) el('div', 'avatar', who).textContent = avatar;
  const names = el('div', '', who);
  el('div', 'name', names).textContent = name;
  if (meta) el('div', 'meta', names).textContent = meta;
  const gainBox = el('div', 'gains', who);
  gains.forEach((g, i) => (el('div', `gain${i ? ' small' : ''}`, gainBox).textContent = g));
  rows.push(who);
  const actions = el('div', 'actions', root);
  const btn = el('div', 'btn primary', actions);
  icon(btn, 'plus', 38, { width: 3 });
  el('span', '', btn).textContent = primary;
  const doneEl = el('div', 'done', btn);
  icon(doneEl, 'check', 40, { width: 3.4 });
  el('span', '', doneEl).textContent = done;
  if (secondary) el('div', 'btn ghost', actions).textContent = secondary;
  rows.push(actions);
  const tint = el('div', 'tint', root);
  const tap = el('div', 'tap', parent);

  let bubble = null;
  let bubbleText = null;
  let tags = [];
  if (ai) {
    bubble = el('div', 'abs b-answer-ai', parent);
    css(bubble, { left: `${left}px`, top: `${aiTop}px`, width: `${width}px` });
    const by = el('div', 'by', bubble);
    icon(by, 'sparkles', 30);
    el('span', '', by).textContent = ai.who ?? `${ctx.brand.name ?? ''} AI`;
    bubbleText = el('div', 'text', bubble);
    const tagRow = el('div', 'tags', bubble);
    tags = (ai.tags ?? []).map((tg) => {
      const s = el('span', `pill ${tg.tone ?? 'accent'}`, tagRow);
      s.textContent = tg.text;
      return s;
    });
  }

  let tapPoint = null;
  if (burst) {
    // Sparks from the button center on press; measured lazily once layout exists.
    ctx.fx.burst({ at: c.press + 0.04, x: left + width * 0.36, y: top + 330, color: ctx.brand.tokens?.positive ?? '#3dcc7a', count: 26, speed: 800, seed: 41, size: 5 });
  }

  return {
    root,
    update(t, frame) {
      const on = t >= c.reveal - 0.03 && t < c.out;
      vis(root, on);
      if (bubble) vis(bubble, on && t >= c.answer - 0.02);
      if (!on) {
        vis(tap, false);
        return;
      }
      const suck = E.inCubic(norm(t, c.out - P.exit, c.out - 0.01));
      const from = (typeof origin === 'function' ? origin(frame) : origin) ?? frame?.pick ?? { x: 540, y: top + 100, r: 14 };
      const reveal = E.inOutCubic(norm(t, c.reveal - 0.02, c.reveal + P.enter + 0.1));
      const radius = lerp(Math.max(10, (from.r ?? 12) * 1.2), 1300, reveal);
      root.style.clipPath = `circle(${radius.toFixed(1)}px at ${(from.x - left).toFixed(1)}px ${(from.y - top).toFixed(1)}px)`;
      tint.style.opacity = String(0.85 * (1 - E.outCubic(norm(t, c.reveal + 0.02, c.reveal + 0.34))));
      const settle = spring(t - c.reveal, { stiffness: 150, damping: 19 });
      tf(root, { s: lerp(0.92, 1, settle) * (1 + suck * 0.35), y: lerp(30, 0, settle) - suck * 40, blur: suck * 18, o: 1 - suck });
      rows.forEach((row, i) => {
        const p = E.outCubic(norm(t, c.reveal + 0.2 + i * P.stagger, c.reveal + 0.2 + P.enter + i * P.stagger));
        tf(row, { y: lerp(26, 0, p), o: p });
      });
      if (!tapPoint) {
        // Layout offsets ignore transforms, so the point is stable while the card animates.
        tapPoint = { x: left + 2 + btn.offsetLeft + btn.offsetWidth / 2, y: top + 2 + btn.offsetTop + btn.offsetHeight / 2 };
      }
      tapAt(tap, t, c.press, tapPoint.x, tapPoint.y - suck * 30);
      tf(btn, { s: pressScale(t, c.press) });
      doneEl.style.clipPath = `inset(0 ${(100 - E.outCubic(norm(t, c.press, c.press + 0.3)) * 100).toFixed(2)}% 0 0)`;
      if (bubble) {
        const k = spring(t - c.answer, { stiffness: 150, damping: 19 });
        tf(bubble, { y: lerp(90, 0, k) + suck * 60, o: clamp((t - c.answer) * 6) * (1 - suck), s: 1 + suck * 0.3, blur: suck * 18 });
        streamWords(bubbleText, ai.text ?? '', t, c.answer + 0.08, c.tags - 0.05);
        tags.forEach((tg, i) => {
          const p = E.outBack(norm(t, c.tags - 0.05 + i * P.stagger, c.tags + 0.35 + i * P.stagger), 1.8);
          tf(tg, { s: lerp(0.6, 1, p), o: clamp(p * 2) });
        });
      }
    },
  };
}

export const DEMO_LEN = 4.5;
export function demo(ctx) {
  return create(ctx, {
    card: { eyebrow: 'Best match', badge: 'Fit 92', avatar: 'AB', name: 'Option name', meta: 'Detail · detail', gains: ['+2.8 one', '+1.1 two'], primary: 'Choose this', secondary: 'Compare' },
    ai: { text: 'One short sentence that says why this option wins.', tags: [{ text: 'Source' }, { text: 'Benefit', tone: 'good' }] },
    origin: { x: 540, y: 600, r: 14 },
    cues: { reveal: 0.2, answer: 0.8, tags: 2.3, press: 3.3 },
  });
}
