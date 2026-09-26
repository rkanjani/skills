// Bar 6: four decisions, one per beat.
import { CUE } from './cues.mjs';
import { E, spring, norm, clamp, lerp, pulse, el, tf, vis, css, svgIcon, ICONS } from './core.mjs';

const WORDS = [
  { at: CUE.stream, text: 'Stream.', from: 'zoom' },
  { at: CUE.sit, text: 'Sit.', from: 'right' },
  { at: CUE.trade, text: 'Trade.', from: 'left' },
  { at: CUE.justAsk, text: 'Just ask.', from: 'up' },
];

const CARDS = [
  `<div class="eyebrow">Waiver wire</div>
   <div class="mini-row" style="background:rgba(61,204,122,0.1);border-color:rgba(61,204,122,0.4);box-shadow:inset 6px 0 0 var(--live)">
     <span class="num" style="color:var(--muted);width:24px">1</span>
     <span style="font-weight:600">Tre Jones</span><span style="color:var(--muted);font-size:26px">PG · 3 games</span>
     <span class="pill good num">+2.8 AST</span></div>
   <div class="mini-row"><span class="num" style="color:var(--muted);width:24px">2</span>
     <span style="font-weight:600">Buddy Hield</span><span style="color:var(--muted);font-size:26px">SG · 4 games</span>
     <span class="pill gold num">+1.4 3PM</span></div>`,
  `<div class="eyebrow">Tonight's lineup</div>
   <div class="mini-row"><span class="slot">PG</span><span style="font-weight:600">Tre Jones</span>
     <span style="color:var(--muted);font-size:26px">plays tonight</span><span class="pill good">START</span></div>
   <div class="mini-row"><span class="slot">SG</span><span style="font-weight:600">Buddy Hield</span>
     <span style="color:var(--muted);font-size:26px">no game</span><span class="pill bad">SIT</span></div>`,
  `<div class="eyebrow">Trade check</div>
   <div class="mini-row" style="justify-content:space-between"><span style="font-weight:600">Hield for Jackson?</span><span class="pill bad" style="margin-left:0">DECLINE</span></div>
   <div class="meter"><i style="width:34%;background:var(--loss)"></i></div>`,
  `<div class="eyebrow">DraftKit AI</div>
   <div class="composer" style="margin:18px 0 0;min-height:104px">
     <div class="text">Should I accept this trade?<span class="caret"></span></div>
     <div class="send" style="width:70px;height:70px">${svgIcon(ICONS.arrowUp, 36, '#fff', 2.6)}</div></div>`,
];

export function createMontage(root) {
  const scene = el('div', 'scene', root);
  const items = WORDS.map((w, i) => {
    const group = el('div', 'layer', scene);
    const echoes = [-2, -1, 1, 2].map((k) => {
      const e = el('div', 'abs word display outline', group);
      e.textContent = w.text;
      return { e, k };
    });
    const word = el('div', 'abs word display', group);
    word.textContent = w.text;
    const card = el('div', 'abs mini panel', group);
    card.innerHTML = CARDS[i];
    return { ...w, group, word, echoes, card };
  });

  // Fit each word to the frame width.
  for (const item of items) {
    css(item.word, { fontSize: '100px', width: 'auto' });
    const width = item.word.getBoundingClientRect().width;
    const size = Math.min(330, (900 / width) * 100);
    item.size = size;
    css(item.word, { width: '', fontSize: `${size}px` });
    item.echoes.forEach(({ e }) => (e.style.fontSize = `${size}px`));
  }

  const WORD_Y = 560;
  const CARD_Y = 1010;

  return {
    update(t) {
      const on = t >= CUE.stream - 0.25 && t < CUE.climb;
      vis(scene, on);
      if (!on) return;
      items.forEach((item, i) => {
        const last = i === items.length - 1;
        const next = items[i + 1]?.at ?? CUE.climb;
        const visible = t >= item.at - 0.06 && t < next + (last ? 0 : 0.03);
        vis(item.group, visible);
        if (!visible) return;
        const p = norm(t, item.at - 0.06, item.at + 0.32);
        const inE = E.outQuart(p);
        // The last word holds and pushes in to a hard cut on the downbeat.
        const outP = last ? 0 : E.inCubic(norm(t, next - 0.2, next + 0.02));
        const pushIn = last ? E.inCubic(norm(t, next - 0.4, next)) : 0;
        const lineH = item.size * 0.86;
        let x = 0;
        let s = 1;
        let skx = 0;
        let blur = 0;
        let y = 0;
        if (item.from === 'zoom') {
          s = lerp(1.9, 1, inE);
          blur = lerp(26, 0, inE);
        } else if (item.from === 'right') {
          x = lerp(900, 0, inE);
          skx = lerp(-24, 0, inE);
          blur = lerp(20, 0, inE);
        } else if (item.from === 'left') {
          x = lerp(-900, 0, inE);
          skx = lerp(24, 0, inE);
          blur = lerp(20, 0, inE);
        } else {
          y = lerp(420, 0, inE);
          blur = lerp(20, 0, inE);
        }
        // Exit: push away from camera and smear toward the next move.
        const exitDir = i === items.length - 1 ? 0 : items[i + 1].from === 'right' ? -1 : items[i + 1].from === 'left' ? 1 : 0;
        x += exitDir * 700 * outP;
        y += (exitDir === 0 ? -320 : 0) * outP;
        s *= 1 - 0.12 * outP;
        blur += 18 * outP;
        const hit = pulse(t, item.at, 11) * (t >= item.at ? 1 : 0);
        const drift = (t - item.at) * -40;
        tf(item.word, { x, y: WORD_Y + y + drift, s: s * (1 + 0.06 * hit + 0.22 * pushIn), skx, blur: blur + pushIn * 6, o: clamp(p * 4) * (1 - outP) });
        item.echoes.forEach(({ e, k }) => {
          const spread = 1 + 0.12 * (1 - inE);
          tf(e, {
            x: x * (1 + Math.abs(k) * 0.15),
            y: WORD_Y + y + k * lineH * spread + drift * (1 + Math.abs(k) * 0.4),
            s,
            skx,
            blur: blur * 1.2,
            o: (0.55 / Math.abs(k)) * clamp(norm(t, item.at, item.at + 0.36)) * (1 - outP),
          });
        });
        const cp = spring(t - item.at + 0.03, { stiffness: 200, damping: 22 });
        const cx = item.from === 'right' ? lerp(700, 0, cp) : item.from === 'left' ? lerp(-700, 0, cp) : 0;
        const cy = item.from === 'up' ? lerp(300, 0, cp) : item.from === 'zoom' ? lerp(140, 0, cp) : 0;
        tf(item.card, {
          x: cx + exitDir * 820 * outP,
          y: CARD_Y + cy - (exitDir === 0 ? 260 : 0) * outP,
          s: (item.from === 'zoom' ? lerp(0.86, 1, cp) : 1) * (1 - 0.08 * outP),
          blur: blur * 0.6 + 14 * outP,
          o: clamp((t - item.at + 0.05) * 5) * (1 - outP),
        });
      });
    },
  };
}
