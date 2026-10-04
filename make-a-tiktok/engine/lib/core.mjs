// Timing, easing, keyframes, and DOM helpers. Everything is a pure function of time so any
// frame renders identically in any order: never read Date, performance.now, or Math.random.

import { ICONS as ICON_SET } from './icons.mjs';

export { ICON_SET as ICONS };

export const W = 1080;
export const H = 1920;

// House timings in seconds. Comprehension comes first: every transition slow enough to follow and
// every line held long enough to read. Blocks use these as defaults and take a `pace` override
// (for example `pace: { exit: 0.5 }`). Keep `accent` snaps for one or two moments per video.
export const PACE = { enter: 0.5, exit: 0.4, stagger: 0.14, accent: 0.24, glide: 1.0 };

// Beat grid for a tempo. Pick bars and BPM so bars * 240 / bpm equals the video length.
export function beatGrid(bpm, bars) {
  const beat = 60 / bpm;
  return {
    bpm,
    bars,
    beat,
    bar: beat * 4,
    duration: bars * beat * 4,
    b: (n) => n * beat,
    step: (barIndex, sixteenth) => barIndex * beat * 4 + (sixteenth * beat) / 4,
  };
}

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

// CSS-style cubic-bezier easing (Newton iterations with a bisection fallback).
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

// House curves: snap (decisive settle), whip (fast camera moves), glide (smooth travel), punch.
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

// Keyframe track: [[time, value], [time, value, ease], ...]. The ease on a key shapes the segment
// arriving at that key. Values may be numbers or equal-length arrays. Keys must be time-sorted.
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

// How heavy a move feels. Use a spring instead of an easing curve wherever something has mass:
// a tiny overshoot on UI, none on type.
export const SPRING = {
  snappy: { stiffness: 320, damping: 30 }, // buttons, toggles, leading edges
  standard: { stiffness: 170, damping: 26 }, // cards, containers, camera
  heavy: { stiffness: 90, damping: 20 }, // big type, 3D objects, logo lockups
  playful: { stiffness: 220, damping: 12 }, // mascots, stickers: visible overshoot
};

// A value with several targets: [[time, value], [time, value, springOptions], ...]. Each change
// adds its own spring from its own start time, so the motion stays continuous through a retarget
// (a cursor, a container's width) and any frame can still be computed on its own. Values may be
// numbers or equal-length arrays. Keys must be time-sorted.
export function springTrack(t, keys, opts = SPRING.standard) {
  const many = Array.isArray(keys[0][1]);
  let v = many ? [...keys[0][1]] : keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    const s = spring(t - keys[i][0], keys[i][2] ?? opts);
    if (s === 0) continue;
    if (many) v = v.map((x, j) => x + (keys[i][1][j] - keys[i - 1][1][j]) * s);
    else v += (keys[i][1] - keys[i - 1][1]) * s;
  }
  return v;
}

// An indicator that stretches as it travels between stops [[time, x], ...]: the leading edge is
// stiffer than the trailing edge. Returns { left, right } for an element `width` wide at rest.
export function stretch(t, stops, width = 0) {
  const lead = springTrack(t, stops, { stiffness: 320, damping: 30 });
  const trail = springTrack(t, stops, { stiffness: 140, damping: 22 });
  return { left: Math.min(lead, trail), right: Math.max(lead, trail) + width };
}

// Opacity for content inside a morphing container: it enters after the morph starts at tIn and
// leaves before the next morph at tOut, so two states never overlap mid-change.
export function swapAlpha(t, tIn, tOut, { delay = 0.08, fadeIn = 0.12, lead = 0.1, fadeOut = 0.1 } = {}) {
  return Math.min(clamp((t - tIn - delay) / fadeIn), clamp((tOut - lead - t) / fadeOut));
}

// Time wrapped into [0, dur): drive a seamless loop from it so the last frame equals the first.
export const loopT = (t, dur) => ((t % dur) + dur) % dur;

// Envelope that rises over [a, a + inDur] and falls over [c - outDur, c].
export function window01(t, a, c, inDur = 0.2, outDur = 0.2, easeIn = E.outCubic, easeOut = E.inCubic) {
  if (t <= a || t >= c) return 0;
  const up = inDur > 0 ? easeIn(norm(t, a, a + inDur)) : 1;
  const down = outDur > 0 ? 1 - easeOut(norm(t, c - outDur, c)) : 1;
  return Math.min(up, down);
}

// Exponential decay after an event; zero before it.
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

// Deterministic value noise in [-1, 1] for drift and shake.
export function noise1(x, seed = 0) {
  const hash = (n) => fract(Math.sin(n * 127.1 + seed * 311.7) * 43758.5453) * 2 - 1;
  const i = Math.floor(x);
  return lerp(hash(i), hash(i + 1), smooth(x - i));
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
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

// DOM ---------------------------------------------------------------------------

export function el(tag, className = '', parent = null) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

// Register a block's stylesheet once (synchronous, so it applies before the first capture).
export function ensureStyle(id, cssText) {
  if (document.getElementById(`style-${id}`)) return;
  const style = document.createElement('style');
  style.id = `style-${id}`;
  style.textContent = cssText;
  document.head.appendChild(style);
}

// Batch style writes in one call.
export function css(node, styles) {
  Object.assign(node.style, styles);
  return node;
}

const fmt = (v) => (Math.abs(v) < 1e-4 ? 0 : Number(v.toFixed(3)));

// Compose transform, opacity, and blur in one call. Never apply `o` or `blur` to an element whose
// children rely on transform-style: preserve-3d: opacity and filter flatten 3D. Put them on the faces.
export function tf(node, p = {}) {
  const {
    x = 0, y = 0, z = 0, s = 1, sx = 1, sy = 1, r = 0, rx = 0, ry = 0, skx = 0, sky = 0, o, blur, persp,
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

// Toggle rendering without layout thrash.
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

// Build a Lucide icon as real SVG nodes (no innerHTML), e.g. icon(chip, 'trophy', 64).
const SVG_NS = 'http://www.w3.org/2000/svg';
export function icon(parent, name, size = 24, { stroke = 'currentColor', width = 2 } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) {
    svg.setAttribute(k, String(v));
  }
  for (const [, tag, attrs] of (ICON_SET[name] ?? ICON_SET.sparkles).matchAll(/<(\w+) ([^>]*?)\/>/g)) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [, k, v] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) child.setAttribute(k, v);
    svg.appendChild(child);
  }
  if (parent) parent.appendChild(svg);
  return svg;
}

// SVG markup string, for places that already build HTML strings.
export const svgIcon = (paths, size = 24, stroke = 'currentColor', width = 2) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
