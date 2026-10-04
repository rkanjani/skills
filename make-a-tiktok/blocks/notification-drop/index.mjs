// A phone-style notification that drops in from the top with a spring and flies back up on exit.
import { E, spring, norm, clamp, lerp, el, css, tf, vis, icon, ensureStyle, PACE } from '../../lib/core.mjs';

const STYLE = `
.b-notif .txt { flex: 1; min-width: 0; }
`;

export function create(ctx, params = {}) {
  ensureStyle('notification-drop', STYLE);
  const { appIcon = 'messageCircle', title = 'Notification', time = 'now', body = '', layout = {}, cues = {}, pace = {}, parent = ctx.ui } = params;
  const P = { ...PACE, ...pace };
  const { left = 60, top = 190 } = layout;
  const c = { in: 0.2, out: Infinity, ...cues };
  const root = el('div', 'abs notif b-notif', parent);
  css(root, { left: `${left}px`, top: `${top}px` });
  icon(el('div', 'app', root), appIcon, 44);
  const txt = el('div', 'txt', root);
  const meta = el('div', 'meta', txt);
  el('span', '', meta).textContent = title;
  el('span', '', meta).textContent = time;
  el('div', 'body', txt).textContent = body;
  return {
    root,
    update(t) {
      if (!vis(root, t >= c.in - 0.05 && t < c.out)) return;
      const k = spring(t - c.in, { stiffness: 170, damping: 19 });
      const out = E.inCubic(norm(t, c.out - P.exit, c.out));
      tf(root, { y: lerp(-260, 0, k) - out * 320, o: clamp((t - c.in) * 6) * (1 - out), s: lerp(0.96, 1, k) });
    },
  };
}

export const DEMO_LEN = 3;
export function demo(ctx) {
  return create(ctx, { title: 'New message', body: 'wait, how did you do that??', cues: { in: 0.3, out: 2.9 }, layout: { top: 700 } });
}
