// AI assistant chat card: header, empty state with suggestion chips, a question typed into the
// composer, send press, the message lifting into the thread, and a thinking row (dotted orb +
// shimmer text). Springs in from below and drops away at its out cue.
import { E, spring, norm, clamp, lerp, pulse, el, css, tf, vis, icon, ensureStyle, PACE } from '../../lib/core.mjs';
import { typeInto, drawOrb, orbCanvas, shimmer, pressScale } from '../../lib/kit.mjs';

const STYLE = `
.b-chat { overflow: hidden; transform-origin: 50% 0%; }
.b-chat .head { display: flex; align-items: center; gap: 22px; height: 140px; padding: 0 34px; color: #fff;
  background: color-mix(in srgb, var(--brand) 55%, var(--bg)); border-bottom: 2px solid rgba(255, 255, 255, 0.08); }
.b-chat .head .ico { display: grid; place-items: center; width: 70px; height: 70px; border-radius: 20px;
  background: rgba(255, 255, 255, 0.1); box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.2); }
.b-chat .head .t1 { font-size: 40px; font-weight: 700; }
.b-chat .head .t2 { font-size: 28px; color: rgba(255, 255, 255, 0.75); margin-top: 2px; }
.b-chat .body { position: relative; padding: 36px 34px; }
.b-chat .empty { position: absolute; left: 0; right: 0; top: 40px; text-align: center; }
.b-chat .empty .ebox { margin: 0 auto; display: grid; place-items: center; width: 112px; height: 112px; border-radius: 30px;
  background: color-mix(in srgb, var(--brand) 28%, transparent); color: color-mix(in srgb, var(--brand) 40%, #fff); }
.b-chat .empty .e1 { margin-top: 28px; font-size: 42px; font-weight: 600; }
.b-chat .empty .e2 { margin-top: 10px; font-size: 30px; color: var(--muted); padding: 0 40px; }
.b-chat .chips { display: flex; justify-content: center; gap: 14px; margin-top: 34px; }
.b-chat .chips > div { font-size: 26px; padding: 14px 22px; border-radius: 999px; background: var(--panel2);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.08); color: var(--muted); white-space: nowrap; }
.b-chat .user { position: absolute; right: 34px; top: 40px; max-width: 820px; box-shadow: 0 20px 50px color-mix(in srgb, var(--brand) 30%, transparent); }
.b-chat .think { position: absolute; left: 34px; display: flex; align-items: center; gap: 18px; font-size: 38px; font-weight: 600; }
.b-chat .composer { margin: 0 26px 26px; display: flex; align-items: center; gap: 20px; min-height: 118px; padding: 18px 18px 18px 30px;
  border-radius: 28px; background: color-mix(in srgb, var(--bg) 70%, var(--panel)); border: 2px solid var(--line); }
.b-chat .composer .txt { flex: 1; font-size: 42px; line-height: 1.3; color: var(--ink); min-height: 46px; }
.b-chat .send { display: grid; place-items: center; width: 78px; height: 78px; flex: none; border-radius: 22px; background: var(--brand); color: var(--brand-ink); }
`;

export function create(ctx, params = {}) {
  ensureStyle('chat-thread', STYLE);
  const {
    title = `${ctx.brand.name ?? ''} AI`,
    subtitle = '',
    headerIcon = 'sparkles',
    empty = { title: 'What should we work on?', text: '', suggestions: [] },
    question = 'Ask me anything.',
    placeholder = 'Ask anything…',
    followup = 'Ask a follow up',
    thinking = 'Thinking',
    layout = {},
    cues = {},
    pace = {},
    parent = ctx.ui,
  } = params;
  const P = { ...PACE, ...pace };
  const { left = 70, top = 420, width = 940, bodyHeight = 500 } = layout;
  // Type at a readable speed (about 18 characters per second at most) and let the question sit.
  const c = { in: 0.2, typeStart: 0.7, typeEnd: 2.4, send: 2.7, thinking: 3.1, out: Infinity, ...cues };

  const root = el('div', 'abs panel b-chat', parent);
  css(root, { left: `${left}px`, top: `${top}px`, width: `${width}px` });
  const head = el('div', 'head', root);
  icon(el('div', 'ico', head), headerIcon, 38, { stroke: '#fff' });
  const titles = el('div', '', head);
  el('div', 't1', titles).textContent = title;
  if (subtitle) el('div', 't2', titles).textContent = subtitle;
  const body = el('div', 'body', root);
  css(body, { height: `${bodyHeight}px` });

  let emptyBox = null;
  let chips = [];
  if (empty) {
    emptyBox = el('div', 'empty', body);
    icon(el('div', 'ebox', emptyBox), 'sparkles', 58);
    el('div', 'e1', emptyBox).textContent = empty.title ?? '';
    if (empty.text) el('div', 'e2', emptyBox).textContent = empty.text;
    const row = el('div', 'chips', emptyBox);
    chips = (empty.suggestions ?? []).map((s) => {
      const chip = el('div', '', row);
      chip.textContent = s;
      return chip;
    });
  }
  const bubble = el('div', 'bubble user', body);
  bubble.textContent = question;
  const think = el('div', 'think', body);
  css(think, { top: `${Math.min(bodyHeight - 110, 250)}px` });
  const orb = orbCanvas(think, 60);
  const thinkText = el('span', 'shimmer', think);
  thinkText.textContent = thinking;
  const composer = el('div', 'composer', root);
  const text = el('div', 'txt', composer);
  const send = el('div', 'send', composer);
  icon(send, 'arrowUp', 40, { width: 2.6 });

  const accent = ctx.brand.tokens?.accent ?? '#d4a24c';
  const accentRgb = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16));

  return {
    root,
    update(t) {
      if (!vis(root, t >= c.in - 0.14 && t < c.out)) return;
      const enter = spring(t - (c.in - 0.12), { stiffness: 120, damping: 18 });
      const leave = E.inCubic(norm(t, c.out - P.exit, c.out));
      tf(root, {
        y: lerp(620, 0, enter) + leave * 1100,
        rx: lerp(38, 0, enter) - leave * 12,
        s: lerp(0.9, 1, enter) - leave * 0.06,
        o: clamp(norm(t, c.in - 0.12, c.in + 0.15) * 1.2) * (1 - leave),
        blur: leave * 10,
      });
      if (emptyBox) {
        const gone = E.inCubic(norm(t, c.send - 0.05, c.send + 0.3));
        tf(emptyBox, { o: 1 - gone, y: -40 * gone, s: 1 - 0.04 * gone });
        chips.forEach((chip, i) => {
          const p = E.outBack(norm(t, c.in + 0.2 + i * P.stagger, c.in + 0.6 + i * P.stagger), 1.6);
          tf(chip, { s: lerp(0.6, 1, p), o: clamp(p * 1.5) });
        });
      }
      if (t >= c.send + 0.02) typeInto(text, '', t, 0, 0, { placeholder: followup, caret: false });
      else typeInto(text, question, t, c.typeStart, c.typeEnd, { placeholder, caret: t > c.in + 0.1 });
      tf(send, { s: pressScale(t, c.send, 0.06) });
      send.style.boxShadow = `0 0 0 ${Math.round(14 * pulse(t, c.send, 7) * (t > c.send ? 1 : 0))}px color-mix(in srgb, var(--brand) 35%, transparent)`;
      const fly = spring(t - c.send, { stiffness: 170, damping: 20 });
      vis(bubble, t >= c.send);
      tf(bubble, { y: lerp(380, 0, fly), s: lerp(0.94, 1, fly), o: clamp((t - c.send) * 8) });
      const th = E.outCubic(norm(t, c.thinking - 0.05, c.thinking + 0.35));
      vis(think, t >= c.thinking - 0.05);
      tf(think, { y: lerp(24, 0, th), o: th });
      drawOrb(orb, t, 120, { accent: accentRgb });
      shimmer(thinkText, t);
    },
  };
}

export const DEMO_LEN = 4;
export function demo(ctx) {
  return create(ctx, {
    subtitle: 'Your workspace',
    empty: { title: 'What should we work on?', text: 'Ask a question to get started.', suggestions: ['First suggestion', 'Second suggestion'] },
    question: 'What should I do next?',
    thinking: 'Reading your data',
    cues: { in: 0.2, typeStart: 0.6, typeEnd: 2.2, send: 2.5, thinking: 2.9 },
  });
}
