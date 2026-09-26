// Bars 3-11: ask DraftKit AI, watch it read the league, get the stream.
import { CUE } from './cues.mjs';
import {
  E, glide, spring, norm, clamp, lerp, pulse, el, tf, vis, setText, css, svgIcon, ICONS, fract,
} from './core.mjs';

const QUESTION = 'Who do I stream this week?';
const ANSWER = 'Three games left. More AST and STL.';
const SUGGESTIONS = ['Who should I stream?', 'Grade this trade', 'Start or sit tonight?'];

// Dotted thought orb, after the product's ThinkingOrb: a Fibonacci sphere with a scan meridian.
export function drawOrb(ctx, t, size, { ink = [244, 241, 232], accent = [212, 162, 76], n = 110, scan = true } = {}) {
  const r = size * 0.4;
  const cx = size / 2;
  const cy = size / 2;
  ctx.clearRect(0, 0, size, size);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const rotY = t * 1.6;
  const tilt = 0.42;
  const sweep = fract(t * 0.9) * Math.PI * 2;
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const rad = Math.sqrt(1 - y * y);
    const a = i * golden;
    let x = Math.cos(a) * rad;
    let z = Math.sin(a) * rad;
    const lon = Math.atan2(z, x);
    // rotate around Y then tilt around X
    const xr = x * Math.cos(rotY) + z * Math.sin(rotY);
    const zr = -x * Math.sin(rotY) + z * Math.cos(rotY);
    const yr = y * Math.cos(tilt) - zr * Math.sin(tilt);
    const zt = y * Math.sin(tilt) + zr * Math.cos(tilt);
    x = xr;
    z = zt;
    let d = Math.abs(Math.atan2(Math.sin(lon + rotY - sweep), Math.cos(lon + rotY - sweep)));
    d = scan ? Math.exp(-(d * d) / 0.08) : 0;
    pts.push({ x: cx + x * r, y: cy - yr * r, z, d });
  }
  pts.sort((a, c) => a.z - c.z);
  for (const p of pts) {
    const depth = (p.z + 1) / 2;
    const col = p.d > 0.05 ? accent.map((v, i) => Math.round(lerp(ink[i], v, p.d))) : ink;
    ctx.fillStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${0.18 + 0.82 * depth})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size * (0.012 + 0.016 * depth + 0.014 * p.d), 0, Math.PI * 2);
    ctx.fill();
  }
}

function orbCanvas(parent, px) {
  const c = el('canvas', '', parent);
  c.width = px * 2;
  c.height = px * 2;
  css(c, { width: `${px}px`, height: `${px}px`, flex: 'none' });
  return c.getContext('2d');
}

export function createChat(root, fx) {
  // --- Bar 2: the ask -------------------------------------------------------
  const chat = el('div', 'abs chat panel', root);
  css(chat, { top: '420px', transformOrigin: '50% 0%' });
  chat.innerHTML = `
    <div class="chat-head">
      <div class="icon">${svgIcon(ICONS.sparkles, 38, '#fff', 2)}</div>
      <div><div class="title">DraftKit AI</div><div class="sub">Stream Team · Week 18 matchup</div></div>
    </div>
    <div class="chat-body"></div>
    <div class="composer"><div class="text"></div><div class="send">${svgIcon(ICONS.arrowUp, 40, '#fff', 2.6)}</div></div>`;
  const body = chat.querySelector('.chat-body');
  const composerText = chat.querySelector('.composer .text');
  const send = chat.querySelector('.send');

  const empty = el('div', '', body);
  css(empty, { position: 'absolute', left: '0', right: '0', top: '44px', textAlign: 'center' });
  empty.innerHTML = `
    <div style="margin:0 auto;display:grid;place-items:center;width:112px;height:112px;border-radius:30px;background:rgba(86,38,211,0.28)">
      ${svgIcon(ICONS.sparkles, 58, '#b9aaf5', 2)}</div>
    <div style="margin-top:28px;font-size:42px;font-weight:600">What should we work on?</div>
    <div style="margin-top:10px;font-size:30px;color:var(--muted)">Ask about your roster, matchup, waiver wire, or a trade.</div>
    <div class="sugg" style="display:flex;justify-content:center;gap:14px;margin-top:34px"></div>`;
  const sugg = empty.querySelector('.sugg');
  const chips = SUGGESTIONS.map((s) => {
    const chip = el('div', '', sugg);
    chip.textContent = s;
    css(chip, {
      fontSize: '26px', padding: '14px 22px', borderRadius: '999px', background: '#1f211c',
      boxShadow: '0 0 0 2px rgba(255,255,255,0.08)', color: 'var(--muted)', whiteSpace: 'nowrap',
    });
    return chip;
  });

  const bubble = el('div', 'bubble-user', body);
  bubble.textContent = QUESTION;
  const thinking = el('div', 'thinking', body);
  css(thinking, { top: '250px' });
  const thinkOrb = orbCanvas(thinking, 60);
  const thinkText = el('span', 'shimmer', thinking);
  thinkText.textContent = 'Reading your league';

  // --- Bar 3: the scan --------------------------------------------------------
  const status = el('div', 'abs scan-status', root);
  css(status, { top: '366px' });
  status.innerHTML = '<div class="head"><span class="orb"></span><span class="shimmer">Reading your league</span></div><div class="tools"></div>';
  const statusOrb = orbCanvas(status.querySelector('.orb'), 64);
  const statusText = status.querySelector('.shimmer');
  const tools = ['Roster', 'Matchup', 'Schedule', 'Waiver wire'].map((label) => {
    const chip = el('div', 'tool', status.querySelector('.tools'));
    chip.innerHTML = `${svgIcon(ICONS.check, 28, 'currentColor', 3)}<span>${label}</span>`;
    return chip;
  });

  // Slot-style counter: the number drops through a mask and the label hugs its width.
  const counter = el('div', 'abs', root);
  css(counter, { left: '0', top: '1300px', width: '1080px', height: '240px' });
  const numMask = el('div', 'abs', counter);
  css(numMask, { left: '70px', top: '0', width: '520px', height: '232px', overflow: 'hidden' });
  const numCur = el('div', 'abs display num', numMask);
  const numPrev = el('div', 'abs display num', numMask);
  for (const n of [numCur, numPrev]) css(n, { left: '0', top: '6px', fontSize: '250px', lineHeight: '230px', color: 'var(--ink)' });
  const labelMask = el('div', 'abs', counter);
  css(labelMask, { top: '60px', height: '120px', width: '640px', overflow: 'hidden' });
  const STEPS = [
    { at: CUE.scan + 0.3, value: 214, label: ['Free', 'agents'] },
    { at: CUE.filter1, value: 38, label: ['3+ games', 'left'] },
    { at: CUE.filter2, value: 3, label: ['AST + STL', 'fits'] },
    { at: CUE.filter3, value: 1, label: ['Best', 'stream'], green: true },
  ];
  const labels = STEPS.map((s) => {
    const l = el('div', 'abs display', labelMask);
    l.innerHTML = `${s.label[0]}<br>${s.label[1]}`;
    css(l, { left: '0', top: '0', fontSize: '62px', lineHeight: '58px', fontWeight: '700', letterSpacing: '0', color: s.green ? 'var(--live)' : 'var(--gold)', whiteSpace: 'nowrap' });
    return l;
  });
  numCur.textContent = '000';
  const digitW = numCur.getBoundingClientRect().width / 3;

  // --- Bar 4: the answer ------------------------------------------------------
  const pick = el('div', 'abs pick panel', root);
  css(pick, { top: '420px' });
  pick.innerHTML = `
    <div class="top"><span class="eyebrow">Best stream</span><span class="fit num">Fit 92</span></div>
    <div class="player">
      <div class="avatar">TJ</div>
      <div><div class="name">Tre Jones</div><div class="meta">PG · 3 games left</div></div>
      <div class="gains"><div class="gain">+2.8 AST</div><div class="gain small">+1.1 STL</div></div>
    </div>
    <div class="actions">
      <div class="add-btn">${svgIcon(ICONS.plus, 38, '#fff', 3)}<span>Add Tre Jones</span>
        <div class="added">${svgIcon(ICONS.check, 40, '#0b0c0a', 3.4)}<span>Added</span></div></div>
      <div class="ghost-btn">Compare</div>
    </div>`;
  const pickRows = [pick.querySelector('.top'), pick.querySelector('.player'), pick.querySelector('.actions')];
  const addBtn = pick.querySelector('.add-btn');
  const added = pick.querySelector('.added');
  const tint = el('div', '', pick);
  css(tint, { position: 'absolute', inset: '0', borderRadius: '28px', background: 'var(--live)', pointerEvents: 'none' });
  const tap = el('div', 'abs tap', root);

  const ai = el('div', 'abs ai-bubble', root);
  css(ai, { top: '900px' });
  ai.innerHTML = `
    <div class="who">${svgIcon(ICONS.sparkles, 30, 'currentColor', 2)}<span>DraftKit AI</span></div>
    <div class="text"></div>
    <div class="tags"><span class="tag">Waiver wire</span><span class="tag">3 games left</span><span class="tag live">AST / STL</span></div>`;
  const aiText = ai.querySelector('.text');
  const aiTags = [...ai.querySelectorAll('.tag')];
  const words = ANSWER.split(' ');

  fx.burst({ at: CUE.add + 0.04, x: 400, y: 860, color: '#3dcc7a', count: 26, speed: 800, seed: 41, size: 5 });

  function ask(t) {
    const enter = spring(t - (CUE.ask - 0.12), { stiffness: 130, damping: 18 });
    const leave = E.inCubic(norm(t, CUE.scan - 0.45, CUE.scan));
    tf(chat, {
      y: lerp(620, 0, enter) + leave * 1100,
      rx: lerp(38, 0, enter) - leave * 12,
      s: lerp(0.9, 1, enter) - leave * 0.06,
      o: clamp(norm(t, CUE.ask - 0.12, CUE.ask + 0.15) * 1.2) * (1 - leave),
      blur: leave * 10,
    });

    // Empty state gives way when the message sends.
    const emptyOut = E.inCubic(norm(t, CUE.send - 0.05, CUE.send + 0.3));
    tf(empty, { o: 1 - emptyOut, y: -40 * emptyOut, s: 1 - 0.04 * emptyOut });
    chips.forEach((chip, i) => {
      const p = E.outBack(norm(t, CUE.ask + 0.25 + i * 0.12, CUE.ask + 0.65 + i * 0.12), 1.6);
      tf(chip, { s: lerp(0.6, 1, p), o: clamp(p * 1.5) });
    });

    // Typing, with a caret that holds solid while keys are moving.
    const typed = Math.floor(QUESTION.length * clamp(norm(t, CUE.typeStart, CUE.typeEnd)));
    const sent = t >= CUE.send + 0.02;
    const caretOn = t < CUE.typeEnd + 0.02 || Math.floor((t - CUE.typeEnd) * 4) % 2 === 0;
    if (sent) {
      composerText.innerHTML = '<span class="placeholder">Ask a follow up</span>';
      composerText.__text = null;
    } else if (typed === 0) {
      setText(composerText, '');
      composerText.innerHTML = `<span class="placeholder">Ask about your team…</span>${t > CUE.ask + 0.1 ? '<span class="caret"></span>' : ''}`;
      composerText.__text = null;
    } else {
      composerText.innerHTML = `${QUESTION.slice(0, typed)}${caretOn ? '<span class="caret"></span>' : ''}`;
      composerText.__text = null;
    }
    const press = norm(t, CUE.send - 0.07, CUE.send + 0.1);
    tf(send, { s: 1 - 0.06 * Math.sin(press * Math.PI) });
    send.style.boxShadow = `0 0 0 ${Math.round(14 * pulse(t, CUE.send, 7) * (t > CUE.send ? 1 : 0))}px rgba(86, 38, 211, 0.35)`;

    // The message lifts out of the composer into the thread.
    const fly = spring(t - CUE.send, { stiffness: 170, damping: 20 });
    vis(bubble, t >= CUE.send);
    tf(bubble, { y: lerp(380, 0, fly), s: lerp(0.94, 1, fly), o: clamp((t - CUE.send) * 8) });
    const th = E.outCubic(norm(t, CUE.thinking - 0.05, CUE.thinking + 0.35));
    vis(thinking, t >= CUE.thinking - 0.05);
    tf(thinking, { y: lerp(24, 0, th), o: th });
    drawOrb(thinkOrb, t, 120);
    thinkText.style.backgroundPosition = `${lerp(120, -140, fract(t / 1.8))}% 0`;
  }

  function scan(t) {
    const inP = E.outCubic(norm(t, CUE.scan - 0.1, CUE.scan + 0.45));
    const out = E.inCubic(norm(t, CUE.answer - 0.45, CUE.answer));
    tf(status, { y: lerp(60, 0, inP) - out * 40, o: inP * (1 - out) });
    drawOrb(statusOrb, t, 128);
    statusText.style.backgroundPosition = `${lerp(120, -140, fract(t / 1.8))}% 0`;
    tools.forEach((chip, i) => {
      const at = CUE.scan + 0.2 + i * 0.25;
      const p = norm(t, at, at + 0.4);
      tf(chip, { s: lerp(0.7, 1, E.outBack(p, 2)), o: clamp(p * 3), y: lerp(16, 0, E.outCubic(p)) });
      chip.querySelector('svg').style.opacity = String(E.outCubic(norm(t, at + 0.15, at + 0.35)));
    });

    // Counter: count up to the pool size, then each filter drops a new number through the mask.
    const cIn = E.outCubic(norm(t, STEPS[0].at - 0.05, STEPS[0].at + 0.4));
    tf(counter, { o: cIn * (1 - out), y: lerp(80, 0, cIn) + out * 60 });
    let i = -1;
    STEPS.forEach((s, k) => {
      if (t >= s.at) i = k;
    });
    const step = STEPS[Math.max(0, i)];
    const q = i < 0 ? 0 : E.outExpo(norm(t, step.at, step.at + 0.45));
    const digitsIn = (v) => String(v).length;
    let widthDigits;
    if (i <= 0) {
      const v = Math.round(214 * E.outCubic(norm(t, STEPS[0].at, STEPS[0].at + 0.9)));
      setText(numCur, String(v));
      tf(numCur, { y: 0 });
      vis(numPrev, false);
      widthDigits = digitsIn(Math.max(1, v));
    } else {
      const prev = STEPS[i - 1];
      setText(numCur, String(step.value));
      setText(numPrev, String(prev.value));
      vis(numPrev, q < 1);
      tf(numCur, { y: lerp(232, 0, q) });
      tf(numPrev, { y: -232 * q, o: 1 - q });
      widthDigits = lerp(digitsIn(prev.value), digitsIn(step.value), q);
    }
    const green = i === 3;
    numCur.style.color = green ? 'var(--live)' : 'var(--ink)';
    numCur.style.textShadow = green ? `0 0 ${Math.round(70 * clamp((t - CUE.filter3) * 3))}px rgba(61,204,122,0.55)` : 'none';
    const punch = i >= 1 ? 0.07 * pulse(t, step.at + 0.05, 9) : 0;
    tf(numMask, { s: 1 + punch });
    numMask.style.transformOrigin = '0% 60%';
    const labelX = 70 + widthDigits * digitW + 34;
    labelMask.style.left = `${labelX.toFixed(1)}px`;
    labels.forEach((l, k) => {
      const at = STEPS[k].at;
      const next = STEPS[k + 1]?.at ?? 99;
      const pin = E.outExpo(norm(t, at, at + 0.45));
      const pout = E.outExpo(norm(t, next, next + 0.45));
      vis(l, t >= at && pout < 1);
      tf(l, { y: lerp(120, 0, pin) - 120 * pout });
    });
  }

  function answer(t, frame) {
    const at = CUE.answer;
    const suck = E.inCubic(norm(t, CUE.suck, CUE.drop - 0.01));
    const lift = { s: 1 + suck * 0.35, blur: suck * 18, o: 1 - suck };

    // Circular reveal from the pick dot on the court.
    const rect = { x: 70, y: 420, w: 940 };
    const origin = frame?.pick ?? { x: 540, y: 520, r: 14 };
    const reveal = glide(norm(t, at - 0.02, at + 0.6));
    const radius = lerp(Math.max(10, origin.r * 1.2), 1250, reveal);
    pick.style.clipPath = `circle(${radius.toFixed(1)}px at ${(origin.x - rect.x).toFixed(1)}px ${(origin.y - rect.y).toFixed(1)}px)`;
    tint.style.opacity = String(0.85 * (1 - E.outCubic(norm(t, at + 0.02, at + 0.34))));
    const settle = spring(t - at, { stiffness: 150, damping: 19 });
    tf(pick, { s: lerp(0.92, 1, settle) * lift.s, y: lerp(30, 0, settle) - suck * 40, blur: lift.blur, o: lift.o });
    pickRows.forEach((row, i) => {
      const p = E.outCubic(norm(t, at + 0.12 + i * 0.14, at + 0.62 + i * 0.14));
      tf(row, { y: lerp(26, 0, p), o: p });
    });

    // Tap, press, and confirm on the add button.
    const tapP = norm(t, CUE.add - 0.2, CUE.add + 0.45);
    vis(tap, tapP > 0 && tapP < 1);
    if (tapP > 0 && tapP < 1) {
      const down = E.outCubic(norm(tapP, 0, 0.3));
      const up = E.outCubic(norm(tapP, 0.3, 1));
      tf(tap, { x: 360, y: 760 - suck * 30, s: lerp(1.5, 0.8, down) + up * 0.9, o: clamp(down * 1.4) * (1 - up) });
    }
    const press = norm(t, CUE.add - 0.04, CUE.add + 0.18);
    tf(addBtn, { s: 1 - 0.04 * Math.sin(press * Math.PI) });
    const fill = E.outCubic(norm(t, CUE.add, CUE.add + 0.3));
    added.style.clipPath = `inset(0 ${(100 - fill * 100).toFixed(2)}% 0 0)`;

    // AI answer streams in beneath the card.
    const aIn = spring(t - CUE.answerText, { stiffness: 150, damping: 19 });
    tf(ai, { y: lerp(90, 0, aIn) + suck * 60, o: clamp((t - CUE.answerText) * 4) * lift.o, s: lift.s * 0.98 + 0.02, blur: lift.blur });
    const shown = Math.ceil(words.length * clamp(norm(t, CUE.answerText + 0.08, CUE.alternates - 0.05)));
    setText(aiText, words.slice(0, shown).join(' '));
    aiTags.forEach((tag, i) => {
      const p = E.outBack(norm(t, CUE.alternates - 0.05 + i * 0.14, CUE.alternates + 0.35 + i * 0.14), 1.8);
      tf(tag, { s: lerp(0.6, 1, p), o: clamp(p * 2) });
    });
  }

  return {
    update(t, frame) {
      if (vis(chat, t >= CUE.ask - 0.14 && t < CUE.scan + 0.02)) ask(t);
      const scanOn = t >= CUE.scan - 0.12 && t < CUE.answer + 0.02;
      vis(status, scanOn);
      vis(counter, scanOn);
      if (scanOn) scan(t);
      const answerOn = t >= CUE.answer - 0.03 && t < CUE.drop;
      vis(pick, answerOn);
      vis(ai, answerOn && t >= CUE.answerText - 0.02);
      if (answerOn) answer(t, frame);
      else vis(tap, false);
    },
  };
}
