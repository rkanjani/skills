// Leaderboard climb: a title ("Climb the / list.") over a ranked table. Your row jumps up slot by
// slot on beats while the rows it passes slide down; the last word of the title can roll to a new
// word (for example "list." to "top.") when you reach the top, and a trophy appears.
import { E, spring, norm, clamp, lerp, pulse, el, css, tf, vis, setText, icon, ensureStyle, PACE } from '../../lib/core.mjs';

const STYLE = `
.b-climb .title { color: var(--ink); white-space: nowrap; }
.b-climb .l2 { position: relative; overflow: hidden; }
.b-climb .l2 > div { position: absolute; left: 0; top: 0; }
.b-climb .card { padding: 18px 0; }
.b-climb .head { display: flex; justify-content: space-between; padding: 10px 34px 18px; }
.b-climb .rows { position: relative; }
.b-climb .row { position: absolute; left: 18px; right: 18px; height: 84px; display: flex; align-items: center; gap: 24px;
  padding: 0 22px; border-radius: 18px; font-size: 35px; }
.b-climb .rk { width: 44px; font-weight: 700; color: var(--muted); font-variant-numeric: tabular-nums; }
.b-climb .nm { font-weight: 600; color: var(--ink); }
.b-climb .rec { margin-left: auto; color: var(--muted); font-variant-numeric: tabular-nums; }
.b-climb .me { background: color-mix(in srgb, var(--brand) 22%, transparent); box-shadow: inset 5px 0 0 var(--positive), 0 20px 60px rgba(0, 0, 0, 0.45); z-index: 2; }
.b-climb .me .rk { color: var(--positive); }
.b-climb .you { font-size: 22px; font-weight: 700; letter-spacing: 0.14em; color: var(--positive);
  background: color-mix(in srgb, var(--positive) 14%, transparent); padding: 4px 12px; border-radius: 8px; }
`;

export function create(ctx, params = {}) {
  ensureStyle('ranked-climb', STYLE);
  const {
    title = null,
    header = { left: 'Ranking', right: '' },
    rows = [],
    me = { name: 'You', badge: 'YOU', recs: [] },
    jumps = [],
    trophy = true,
    layout = {},
    cues = {},
    pace = {},
    parent = ctx.ui,
  } = params;
  const P = { ...PACE, ...pace };
  const { left = 70, width = 940, titleTop = 362, titleSize = 196, cardTop = 762, rowH = 88 } = layout;
  const c = { in: 0, swap: jumps[jumps.length - 1]?.at ?? null, out: Infinity, ...cues };
  const slots = rows.length + 1;
  const startSlot = jumps[0]?.from ?? rows.length;

  const root = el('div', 'scene b-climb', parent);
  let titleEl = null;
  let w1 = null;
  let w2 = null;
  if (title) {
    titleEl = el('div', 'abs display title', root);
    css(titleEl, { left: `${left}px`, top: `${titleTop}px`, fontSize: `${titleSize}px` });
    el('div', '', titleEl).textContent = title.lines?.[0] ?? '';
    const l2 = el('div', 'l2', titleEl);
    css(l2, { height: `${Math.round(titleSize * 0.88)}px`, marginTop: '-4px' });
    w1 = el('div', '', l2);
    w1.textContent = title.lines?.[1] ?? '';
    if (title.swap) {
      w2 = el('div', '', l2);
      w2.textContent = title.swap;
      css(w2, { color: 'var(--accent)' });
    }
  }
  const card = el('div', 'abs panel card', root);
  css(card, { left: `${left}px`, top: `${cardTop}px`, width: `${width}px` });
  const head = el('div', 'head', card);
  el('span', 'eyebrow', head).textContent = header.left ?? '';
  const hr = el('span', 'eyebrow', head);
  hr.textContent = header.right ?? '';
  css(hr, { color: 'var(--muted)' });
  const box = el('div', 'rows', card);
  css(box, { height: `${rowH * slots - 4}px` });

  // Others keep their original order in the slots not taken by you.
  const others = rows.map((r, i) => {
    const row = el('div', 'row', box);
    const rk = el('span', 'rk', row);
    el('span', 'nm', row).textContent = r.name;
    el('span', 'rec', row).textContent = r.rec ?? '';
    const slot = i < startSlot ? i : i + 1;
    return { row, rk, slot };
  });
  const mine = el('div', 'row me', box);
  const myRk = el('span', 'rk', mine);
  el('span', 'nm', mine).textContent = me.name;
  if (me.badge) el('span', 'you', mine).textContent = me.badge;
  const myRec = el('span', 'rec', mine);
  const trophyEl = trophy ? el('span', '', mine) : null;
  if (trophyEl) {
    icon(trophyEl, 'trophy', 40, { stroke: 'var(--accent)', width: 2.2 });
    css(trophyEl, { display: 'grid', placeItems: 'center', width: '40px' });
  }

  jumps.forEach((j, i) => {
    ctx.fx.burst({ at: j.at + 0.25, x: left + 80, y: cardTop + 88 + j.to * rowH + 42, color: i === jumps.length - 1 ? ctx.brand.tokens?.accent ?? '#d4a24c' : ctx.brand.tokens?.positive ?? '#3dcc7a', count: i === jumps.length - 1 ? 60 : 22, speed: i === jumps.length - 1 ? 1400 : 700, seed: 300 + i, size: i === jumps.length - 1 ? 7 : 5 });
  });

  return {
    root,
    update(t) {
      if (!vis(root, t >= c.in && t < c.out)) return;
      const k = spring(t - c.in, { stiffness: 170, damping: 21 });
      const exit = E.inCubic(norm(t, c.out - P.exit, c.out));
      if (titleEl) {
        const slam = E.outQuart(norm(t, c.in, c.in + P.enter));
        tf(titleEl, { y: -exit * 420, s: lerp(1.35, 1, slam) * (1 + 0.04 * (c.swap === null ? 0 : pulse(t, c.swap, 9)) * (t > (c.swap ?? Infinity) ? 1 : 0)), o: clamp((t - c.in) * 7) * (1 - exit), blur: lerp(18, 0, slam) + exit * 16 });
        if (w2 && c.swap !== null) {
          const q = norm(t, c.swap - 0.1, c.swap + 0.5);
          tf(w1, { y: -titleSize * E.inExpo(clamp(q * 2)) });
          tf(w2, { y: titleSize * (1 - E.outExpo(q)) });
          w2.style.textShadow = `0 0 ${Math.round(60 * pulse(t, c.swap + 0.1, 3))}px color-mix(in srgb, var(--accent) 60%, transparent)`;
        }
      }
      tf(card, { y: lerp(420, 0, k) - exit * 300, rx: lerp(-24, 0, k) + exit * 20, o: clamp((t - c.in) * 5) * (1 - exit), blur: exit * 14 });
      let mySlot = startSlot;
      let done = 0;
      let lift = 0;
      jumps.forEach((j, i) => {
        const p = E.inOutCubic(norm(t, j.at, j.at + 0.45));
        if (p > 0) mySlot = lerp(j.from, j.to, p);
        if (p >= 0.5) done = i + 1;
        lift += Math.sin(Math.PI * clamp(norm(t, j.at, j.at + 0.45)));
      });
      tf(mine, { y: mySlot * rowH, z: 40 * lift, s: 1 + 0.035 * lift });
      const rank = done === 0 ? startSlot + 1 : jumps[done - 1].to + 1;
      setText(myRk, String(rank));
      setText(myRec, me.recs?.[done] ?? '');
      myRk.style.color = done === jumps.length && jumps.length ? 'var(--accent)' : 'var(--positive)';
      if (trophyEl) {
        const tp = E.outBack(norm(t, (c.swap ?? Infinity) + 0.2, (c.swap ?? Infinity) + 0.6), 2);
        vis(trophyEl, tp > 0);
        tf(trophyEl, { s: tp, o: clamp(tp * 2) });
      }
      others.forEach((o) => {
        let displaced = 0;
        jumps.forEach((j) => {
          if (o.slot >= j.to && o.slot < j.from) displaced += E.inOutCubic(norm(t, j.at + 0.05, j.at + 0.5));
        });
        tf(o.row, { y: (o.slot + displaced) * rowH });
        setText(o.rk, String(o.slot + 1 + Math.round(displaced)));
      });
    },
  };
}

export const DEMO_LEN = 4.2;
export function demo(ctx) {
  return create(ctx, {
    title: { lines: ['Climb the', 'list.'], swap: 'top.' },
    header: { left: 'Leaderboard', right: 'This week' },
    rows: [{ name: 'Entry one', rec: '920' }, { name: 'Entry two', rec: '880' }, { name: 'Entry three', rec: '840' }, { name: 'Entry four', rec: '800' }],
    me: { name: 'You', badge: 'YOU', recs: ['790', '850', '900', '950'] },
    jumps: [{ at: 0.9, from: 4, to: 2 }, { at: 1.8, from: 2, to: 1 }, { at: 2.7, from: 1, to: 0 }],
    layout: { cardTop: 700 },
    cues: { in: 0.1 },
  });
}
