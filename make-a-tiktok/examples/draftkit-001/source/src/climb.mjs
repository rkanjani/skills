// Bars 17-18: win the week, then climb the standings to first.
import { CUE } from './cues.mjs';
import { E, snap, spring, norm, clamp, lerp, pulse, el, tf, vis, setText, css, svgIcon, ICONS } from './core.mjs';

const TEAMS = [
  { name: "Pippen Ain't Easy", rec: '118-79-6' },
  { name: 'Swish Army Knife', rec: '114-83-6' },
  { name: 'Brick City', rec: '111-86-6' },
  { name: 'Load Management', rec: '107-90-6' },
  { name: 'Free Throw Merchants', rec: '104-93-6' },
  { name: 'Glass Cleaners', rec: '102-95-6' },
];
const ME = { name: 'Stream Team', recs: ['101-96-6', '105-92-6', '109-88-6', '114-83-6', '119-78-6'] };
const JUMPS = [
  { at: CUE.rank5, from: 6, to: 4 },
  { at: CUE.rank3, from: 4, to: 2 },
  { at: CUE.rank2, from: 2, to: 1 },
  { at: CUE.rank1, from: 1, to: 0 },
];
const ROW = 88;

export function createClimb(root, fx) {
  const scene = el('div', 'scene', root);

  const title = el('div', 'abs climb-title display', scene);
  css(title, { top: '362px', fontSize: '196px' });
  const l1 = el('div', '', title);
  l1.textContent = 'Win your';
  const l2 = el('div', 'mask', title);
  css(l2, { position: 'relative', height: '172px', marginTop: '-4px' });
  const week = el('div', 'abs', l2);
  week.textContent = 'week.';
  const league = el('div', 'abs', l2);
  league.textContent = 'league.';
  css(league, { color: 'var(--gold)' });

  const card = el('div', 'abs standings panel', scene);
  css(card, { top: '762px' });
  card.innerHTML = `<div class="head"><span class="eyebrow">League standings</span><span class="eyebrow" style="color:var(--muted)">Week 18</span></div><div class="rows"></div>`;
  const rowsBox = card.querySelector('.rows');
  css(rowsBox, { height: `${ROW * 7 - 4}px` });
  const others = TEAMS.map((team, i) => {
    const row = el('div', 'st-row', rowsBox);
    row.innerHTML = `<span class="rk">${i + 1}</span><span class="nm">${team.name}</span><span class="rec">${team.rec}</span>`;
    return { row, rk: row.querySelector('.rk'), slot: i };
  });
  const me = el('div', 'st-row me', rowsBox);
  me.innerHTML = `<span class="rk">7</span><span class="nm">${ME.name}</span><span class="you" style="font-size:22px;font-weight:700;letter-spacing:0.14em;color:var(--live);background:rgba(61,204,122,0.14);padding:4px 12px;border-radius:8px">YOU</span><span class="rec">${ME.recs[0]}</span>`;
  const meRk = me.querySelector('.rk');
  const meRec = me.querySelector('.rec');
  const trophy = el('span', '', me);
  trophy.innerHTML = svgIcon(ICONS.trophy, 40, 'var(--gold)', 2.2);
  css(trophy, { display: 'grid', placeItems: 'center', width: '40px' });

  JUMPS.forEach((j, i) => {
    fx.burst({ at: j.at + 0.22, x: 150, y: 762 + 88 + j.to * ROW + 42, color: i === 3 ? '#d4a24c' : '#3dcc7a', count: i === 3 ? 60 : 22, speed: i === 3 ? 1400 : 700, seed: 300 + i, size: i === 3 ? 7 : 5 });
  });

  return {
    update(t) {
      const exitStart = CUE.logo - 0.65;
      const exitEnd = CUE.logo - 0.2;
      const on = t >= CUE.climb && t < exitEnd;
      vis(scene, on);
      if (!on) return;
      const inP = spring(t - CUE.climb, { stiffness: 180, damping: 21 });
      const exit = E.inCubic(norm(t, exitStart, exitEnd));

      // Title slams in on the downbeat. WEEK. rolls up to LEAGUE. when you take first.
      const slam = E.outQuart(norm(t, CUE.climb, CUE.climb + 0.5));
      tf(title, {
        y: -exit * 420,
        s: lerp(1.35, 1, slam) * (1 + 0.04 * pulse(t, CUE.rank1, 9) * (t > CUE.rank1 ? 1 : 0)),
        o: clamp((t - CUE.climb) * 7) * (1 - exit),
        blur: lerp(18, 0, slam) + exit * 16,
      });
      const swap = norm(t, CUE.rank1 - 0.1, CUE.rank1 + 0.5);
      tf(week, { y: -180 * E.inExpo(clamp(swap * 2)) });
      tf(league, { y: 180 * (1 - E.outExpo(swap)) });
      league.style.textShadow = `0 0 ${Math.round(60 * pulse(t, CUE.rank1 + 0.1, 3))}px rgba(212,162,76,0.6)`;

      tf(card, { y: lerp(420, 0, inP) - exit * 300, rx: lerp(-24, 0, inP) + exit * 20, o: clamp((t - CUE.climb) * 5) * (1 - exit), blur: exit * 14 });

      // Your row travels up through each jump; the rows you pass slide down one slot each.
      let mySlot = 6;
      let jumpsDone = 0;
      JUMPS.forEach((j, i) => {
        const p = snap(norm(t, j.at, j.at + 0.42));
        if (p > 0) {
          mySlot = lerp(j.from, j.to, p);
          if (p >= 0.5) jumpsDone = i + 1;
        }
      });
      const lift = JUMPS.reduce((acc, j) => acc + Math.sin(Math.PI * clamp(norm(t, j.at, j.at + 0.42))), 0);
      tf(me, { y: mySlot * ROW, z: 40 * lift, s: 1 + 0.035 * lift });
      const rank = [7, 5, 3, 2, 1][jumpsDone];
      setText(meRk, String(rank));
      setText(meRec, ME.recs[jumpsDone]);
      const gold = t >= CUE.rank1 + 0.1;
      meRk.style.color = gold ? 'var(--gold)' : 'var(--live)';
      const tp = E.outBack(norm(t, CUE.rank1 + 0.15, CUE.rank1 + 0.55), 2);
      tf(trophy, { s: tp, o: clamp(tp * 2) });
      vis(trophy, tp > 0);

      others.forEach((o) => {
        let y = o.slot * ROW;
        let displaced = 0;
        JUMPS.forEach((j) => {
          if (o.slot >= j.to && o.slot < j.from) {
            // This row is passed during jump j; it moves down one slot.
            displaced += snap(norm(t, j.at + 0.04, j.at + 0.46));
          }
        });
        y += displaced * ROW;
        tf(o.row, { y });
        setText(o.rk, String(o.slot + 1 + Math.round(displaced)));
        o.row.style.opacity = String(o.slot + displaced > 6.5 ? 0 : 1);
      });
    },
  };
}
