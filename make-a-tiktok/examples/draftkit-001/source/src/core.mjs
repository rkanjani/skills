// Shared timing, easing, and DOM helpers for the showreel composition.
// Everything is a pure function of time so any frame can be rendered in any order.

export const W = 1080;
export const H = 1920;
export const DURATION = 39.375;
export const BPM = 128;
export const BEAT = 60 / BPM; // 0.46875s, so 84 beats (21 bars) land exactly on 39.375s
export const BAR = BEAT * 4;
export const b = (n) => n * BEAT;

export const TOKENS = {
  bg: '#0b0c0a',
  panel: '#131511',
  panel2: '#1b1d18',
  ink: '#f4f1e8',
  muted: '#b8b4a6',
  line: 'rgba(232, 214, 170, 0.14)',
  gold: '#d4a24c',
  brand: '#5626d3',
  brandHover: '#6740d8',
  live: '#3dcc7a',
  warn: '#e0b34d',
  loss: '#f87171',
  ai: '#3f327a',
};

export const clamp = (x, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, c, t) => a + (c - a) * t;
export const norm = (t, a, c) => (c === a ? (t >= c ? 1 : 0) : clamp((t - a) / (c - a)));
export const mix = (a, c, t) => (Array.isArray(a) ? a.map((v, i) => lerp(v, c[i], t)) : lerp(a, c, t));
export const smooth = (x) => x * x * (3 - 2 * x);
export const fract = (x) => x - Math.floor(x);

export const E = {
  linear: (x) => x,
  inQuad: (x) => x * x,
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  inOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2),
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - (1 - x) ** 3,
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
  inQuart: (x) => x ** 4,
  outQuart: (x) => 1 - (1 - x) ** 4,
  inOutQuart: (x) => (x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2),
  outQuint: (x) => 1 - (1 - x) ** 5,
  inOutQuint: (x) => (x < 0.5 ? 16 * x ** 5 : 1 - (-2 * x + 2) ** 5 / 2),
  inExpo: (x) => (x <= 0 ? 0 : 2 ** (10 * x - 10)),
  outExpo: (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
  inOutExpo: (x) =>
    x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2,
  outBack: (x, s = 1.70158) => 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2,
  inBack: (x, s = 1.70158) => (s + 1) * x ** 3 - s * x * x,
  outSine: (x) => Math.sin((x * Math.PI) / 2),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  outCirc: (x) => Math.sqrt(1 - (x - 1) ** 2),
};

// CSS-style cubic-bezier easing, solved with Newton iterations plus bisection fallback.
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const err = sx(t) - x;
      if (Math.abs(err) < 1e-6) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 30; i += 1) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

// House curves. `snap` matches the landing page bar-fill curve.
export const snap = bezier(0.22, 1, 0.36, 1);
export const whip = bezier(0.75, 0, 0.15, 1);
export const glide = bezier(0.45, 0, 0.1, 1);
export const punch = bezier(0.2, 0.9, 0.2, 1);

// Damped spring step response for elapsed seconds `t`. Overshoots when under-damped.
export function spring(t, { stiffness = 220, damping = 18, mass = 1 } = {}) {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
}

// Keyframe track: [[time, value], [time, value, ease], ...]. The ease on a key shapes the
// segment arriving at that key. Values may be numbers or equal-length arrays.
export function track(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    const [t1, v1, ease = E.inOutCubic] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      const p = t1 === t0 ? 1 : (t - t0) / (t1 - t0);
      return mix(v0, v1, ease(p));
    }
  }
  return keys[keys.length - 1][1];
}

// Envelope that rises over [a, a+inDur] and falls over [c-outDur, c].
export function window01(t, a, c, inDur = 0.2, outDur = 0.2, easeIn = E.outCubic, easeOut = E.inCubic) {
  if (t <= a || t >= c) return 0;
  const up = inDur > 0 ? easeIn(norm(t, a, a + inDur)) : 1;
  const down = outDur > 0 ? 1 - easeOut(norm(t, c - outDur, c)) : 1;
  return Math.min(up, down);
}

// Exponential decay pulse after an event time.
export const pulse = (t, at, decay = 6) => (t < at ? 0 : Math.exp(-(t - at) * decay));

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic value noise in [-1, 1] for camera shake and drift.
export function noise1(x, seed = 0) {
  const hash = (n) => fract(Math.sin(n * 127.1 + seed * 311.7) * 43758.5453) * 2 - 1;
  const i = Math.floor(x);
  const f = x - i;
  return lerp(hash(i), hash(i + 1), smooth(f));
}

export function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgba(hex, a = 1) {
  const [r, g, bl] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${bl}, ${a})`;
}

export function mixHex(h1, h2, t) {
  const c1 = hexToRgb(h1);
  const c2 = hexToRgb(h2);
  const m = c1.map((v, i) => Math.round(lerp(v, c2[i], clamp(t))));
  return `rgb(${m[0]}, ${m[1]}, ${m[2]})`;
}

// DOM ---------------------------------------------------------------------

export function el(tag, className = '', parent = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

export function css(node, styles) {
  Object.assign(node.style, styles);
  return node;
}

const fmt = (v) => (Math.abs(v) < 1e-4 ? 0 : Number(v.toFixed(3)));

// Compose a transform + opacity + blur in one call.
export function tf(node, p = {}) {
  const {
    x = 0, y = 0, z = 0, s = 1, sx = 1, sy = 1, r = 0, rx = 0, ry = 0, skx = 0, sky = 0,
    o, blur, persp,
  } = p;
  let t = '';
  if (persp) t += `perspective(${persp}px) `;
  t += `translate3d(${fmt(x)}px, ${fmt(y)}px, ${fmt(z)}px)`;
  if (rx) t += ` rotateX(${fmt(rx)}deg)`;
  if (ry) t += ` rotateY(${fmt(ry)}deg)`;
  if (r) t += ` rotate(${fmt(r)}deg)`;
  if (skx || sky) t += ` skew(${fmt(skx)}deg, ${fmt(sky)}deg)`;
  if (s !== 1 || sx !== 1 || sy !== 1) t += ` scale(${fmt(s * sx)}, ${fmt(s * sy)})`;
  node.style.transform = t;
  if (o !== undefined) node.style.opacity = String(fmt(clamp(o)));
  if (blur !== undefined) node.style.filter = blur > 0.05 ? `blur(${fmt(blur)}px)` : 'none';
}

// Toggle rendering without thrashing layout on every frame.
export function vis(node, on) {
  const next = on ? '' : 'none';
  if (node.__display !== next) {
    node.style.display = next;
    node.__display = next;
  }
  return on;
}

export function setText(node, text) {
  if (node.__text !== text) {
    node.textContent = text;
    node.__text = text;
  }
}

// Split text into per-character spans inside `parent`. Spaces keep their width.
export function splitChars(parent, text, className = 'ch') {
  parent.textContent = '';
  return Array.from(text).map((c) => {
    const span = el('span', className, parent);
    span.textContent = c === ' ' ? ' ' : c;
    span.style.display = 'inline-block';
    return span;
  });
}

export const svgIcon = (paths, size = 24, stroke = 'currentColor', width = 2) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

// Lucide icon geometry (https://lucide.dev, ISC License, Copyright (c) Lucide Contributors 2022),
// matching the product's icon set.
export const ICONS = {
  sparkles:
    '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
  arrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  trendingUp: '<path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/>',
  arrowLeftRight: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  calendar:
    '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  chevronsUp: '<path d="m17 11-5-5-5 5"/><path d="m17 18-5-5-5 5"/>',
  message:
    '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  trophy:
    '<path d="M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978"/><path d="M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978"/><path d="M18 9h1.5a1 1 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"/><path d="M6 9H4.5a1 1 0 0 1 0-5H6"/>',
  messageCircle:
    '<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>',
};
