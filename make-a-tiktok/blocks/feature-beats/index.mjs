// A sequence of feature beats, one per cue: big index number, icon chip, fitted title, proof line.
// Each beat slides in (right, left, up, down, or zoom), holds while the viewer reads the title and
// proof, and clears before the next beat lands. Give each beat about 4 s.
import { E, spring, norm, clamp, lerp, pulse, el, css, tf, vis, icon, ensureStyle, PACE } from '../../lib/core.mjs';
import { fitText, slamIn } from '../../lib/kit.mjs';

const STYLE = `
.b-feat .idx { left: 70px; font-size: 220px; color: var(--accent); }
.b-feat .chip { left: 820px; display: grid; place-items: center; width: 150px; height: 150px; border-radius: 40px;
  color: var(--brand-ink); background: var(--brand); box-shadow: 0 30px 80px color-mix(in srgb, var(--brand) 45%, transparent); }
.b-feat .title { left: 70px; color: var(--ink); white-space: nowrap; }
.b-feat .proof { left: 70px; width: 900px; font-size: 46px; line-height: 1.3; font-weight: 500; color: var(--ink); }
`;

export function create(ctx, params = {}) {
  ensureStyle('feature-beats', STYLE);
  const { items = [], cues = {}, layout = {}, modes = ['right', 'left', 'up'], pace = {}, parent = ctx.ui } = params;
  const P = { ...PACE, ...pace };
  const { at = [], end = Infinity } = cues;
  const { top = 360 } = layout;
  const root = el('div', 'scene b-feat', parent);
  const beats = items.map((item, i) => {
    const group = el('div', 'layer', root);
    const index = el('div', 'abs display idx', group);
    index.textContent = item.index ?? String(i + 1).padStart(2, '0');
    const chip = el('div', 'abs chip', group);
    icon(chip, item.icon ?? 'sparkles', 64);
    const title = el('div', 'abs display title', group);
    title.textContent = item.title ?? '';
    const size = fitText(title, 920, item.maxSize ?? 190);
    const proof = el('div', 'abs proof', group);
    proof.textContent = item.proof ?? '';
    css(index, { top: `${top}px` });
    css(chip, { top: `${top + 40}px` });
    css(title, { top: `${top + 280}px` });
    css(proof, { top: `${top + 290 + size * 0.95}px` });
    return { group, index, chip, title, proof, at: at[i], mode: item.mode ?? modes[i % modes.length] };
  });

  return {
    root,
    update(t) {
      if (!vis(root, beats.length > 0 && t >= beats[0].at - 0.12 && t < end)) return;
      beats.forEach((b, i) => {
        const next = beats[i + 1]?.at ?? end;
        if (!vis(b.group, t >= b.at - 0.1 && t < next)) return;
        const inP = slamIn(t, b.at, b.mode, { dur: P.enter });
        const out = E.inCubic(norm(t, next - P.exit, next - 0.02));
        const hit = pulse(t, b.at, 11) * (t >= b.at ? 1 : 0);
        tf(b.title, { ...inP, s: inP.s * (1 + 0.05 * hit) * (1 - 0.08 * out), blur: inP.blur + out * 16, o: inP.o * (1 - out) });
        const k = spring(t - b.at + 0.02, { stiffness: 190, damping: 20 });
        tf(b.index, { y: lerp(-80, 0, k), o: clamp((t - b.at + 0.05) * 8) * (1 - out) });
        const c = norm(t, b.at + 0.1, b.at + 0.1 + P.enter);
        tf(b.chip, { s: lerp(0.4, 1, E.outBack(c, 2)), r: lerp(-30, 0, E.outCubic(c)), o: (1 - out) * clamp((t - b.at) * 8) });
        const pr = E.outCubic(norm(t, b.at + 0.35, b.at + 0.35 + P.enter));
        tf(b.proof, { y: lerp(40, 0, pr), o: pr * (1 - out) });
      });
    },
  };
}

export const DEMO_LEN = 7;
export function demo(ctx) {
  return create(ctx, {
    items: [
      { title: 'Waiver streams', proof: 'Ranks free agents by games left.', icon: 'trendingUp' },
      { title: 'Trade check', proof: 'Tests a deal against this week.', icon: 'arrowLeftRight' },
    ],
    cues: { at: [0.3, 3.6], end: 6.9 },
  });
}
