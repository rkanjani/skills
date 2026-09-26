// Motion components. Each is deterministic in t: build DOM once, then call the update each frame.
import { E, spring, norm, clamp, lerp, fract, el, css, tf, vis, setText, PACE } from './core.mjs';
import { project } from './world3d.mjs';

// Typography -------------------------------------------------------------------------------

export function splitChars(parent, text, className = 'ch') {
  parent.textContent = '';
  return Array.from(text).map((c) => {
    const span = el('span', className, parent);
    span.textContent = c === ' ' ? ' ' : c;
    span.style.display = 'inline-block';
    return span;
  });
}

// Letters rise out of a masking line (the parent needs overflow: hidden). Negative `start` means
// the rise is already underway on frame zero, which keeps thumbnails from being empty.
export function riseChars(chars, t, start, { stagger = 0.05, dur = 0.7, from = 300, exitAt = null, exitTo = -300, exitDur = PACE.exit } = {}) {
  chars.forEach((c, i) => {
    const s = start + i * stagger;
    const p = E.outExpo(norm(t, s, s + dur));
    const leave = exitAt === null ? 0 : E.inCubic(norm(t, exitAt + i * stagger * 0.4, exitAt + exitDur + i * stagger * 0.4));
    tf(c, { y: lerp(from, 0, p) + exitTo * leave });
  });
}

// Size text to fit a width. Call after fonts load.
export function fitText(node, maxWidth, maxSize = 330) {
  const prev = { display: node.style.display, width: node.style.width, whiteSpace: node.style.whiteSpace };
  css(node, { fontSize: '100px', width: 'auto', display: 'inline-block', whiteSpace: 'nowrap' });
  const width = node.getBoundingClientRect().width || 1;
  const size = Math.min(maxSize, (maxWidth / width) * 100);
  css(node, { ...prev, fontSize: `${size}px` });
  return size;
}

// Outlined echoes stacked above and below a word: kinetic-type texture.
export function echoStack(parent, text, { className = 'display', offsets = [-2, -1, 1, 2] } = {}) {
  return offsets.map((k) => {
    const node = el('div', `abs ${className} outline`, parent);
    node.textContent = text;
    return { node, k };
  });
}

// Entrance transform for a slammed word. mode: zoom | left | right | up | down.
export function slamIn(t, at, mode = 'zoom', { lead = 0.08, dur = PACE.enter, dist = 900, ease = E.outQuart } = {}) {
  const p = norm(t, at - lead, at + dur - lead);
  const k = ease(p);
  const base = { x: 0, y: 0, s: 1, skx: 0, blur: 0, o: clamp(p * 4) };
  if (mode === 'zoom') return { ...base, s: lerp(1.9, 1, k), blur: lerp(26, 0, k) };
  if (mode === 'left') return { ...base, x: lerp(-dist, 0, k), skx: lerp(24, 0, k), blur: lerp(20, 0, k) };
  if (mode === 'right') return { ...base, x: lerp(dist, 0, k), skx: lerp(-24, 0, k), blur: lerp(20, 0, k) };
  if (mode === 'down') return { ...base, y: lerp(-dist * 0.5, 0, k), blur: lerp(20, 0, k) };
  return { ...base, y: lerp(dist * 0.47, 0, k), blur: lerp(20, 0, k) };
}

// Numbers ------------------------------------------------------------------------------------

// Odometer digit: set(4.5) shows halfway between 4 and 5. Needs .digit/.strip styles from kit.css.
export function roller(parent) {
  const box = el('span', 'digit', parent);
  const strip = el('span', 'strip', box);
  for (let i = 0; i <= 10; i += 1) el('span', '', strip).textContent = String(i % 10);
  return {
    box,
    set(v) {
      strip.style.transform = `translate3d(0, ${(-v).toFixed(4)}em, 0)`;
    },
  };
}

// Slot counter: the new value drops in through a mask while the old one leaves.
export function slotNumber(parent, { fontSize = 250, height = 232, className = 'display num' } = {}) {
  const mask = el('div', 'abs', parent);
  css(mask, { left: '0', top: '0', height: `${height}px`, width: `${fontSize * 2.2}px`, overflow: 'hidden' });
  const cur = el('div', `abs ${className}`, mask);
  const prev = el('div', `abs ${className}`, mask);
  for (const n of [cur, prev]) css(n, { left: '0', top: '6px', fontSize: `${fontSize}px`, lineHeight: `${height - 2}px` });
  cur.textContent = '000';
  const digitW = cur.getBoundingClientRect().width / 3;
  return {
    mask,
    cur,
    digitW,
    // Show `value` arriving from `from` with progress q in [0, 1].
    set(from, value, q) {
      setText(cur, String(value));
      setText(prev, String(from));
      vis(prev, q < 1 && from !== value);
      tf(cur, { y: lerp(height, 0, from === value ? 1 : q) });
      tf(prev, { y: -height * q, o: 1 - q });
      return lerp(String(from).length, String(value).length, q) * digitW;
    },
  };
}

// Text reveals ---------------------------------------------------------------------------------

// Types `text` into node between t0 and t1 with a caret that holds solid while keys move.
export function typeInto(node, text, t, t0, t1, { placeholder = '', caret = true } = {}) {
  const n = Math.floor(text.length * clamp(norm(t, t0, t1)));
  const caretOn = caret && (t < t1 + 0.02 || Math.floor((t - t1) * 4) % 2 === 0);
  const key = `${text}|${n}|${caretOn}|${placeholder}`;
  if (node.__typed === key) return n;
  node.__typed = key;
  node.textContent = '';
  if (n === 0 && placeholder) {
    el('span', 'placeholder', node).textContent = placeholder;
  } else {
    node.append(text.slice(0, n));
  }
  if (caretOn) el('span', 'caret', node);
  return n;
}

// LLM-style streaming, word by word.
export function streamWords(node, text, t, t0, t1) {
  const words = text.split(' ');
  const shown = Math.ceil(words.length * clamp(norm(t, t0, t1)));
  setText(node, words.slice(0, shown).join(' '));
  return shown;
}

// Clip a node to a growing circle from a screen point (e.g. a dot on the floor). rect is the
// node's page position { x, y }; origin is a screen point { x, y, r }.
export function circularReveal(node, rect, origin, t, t0, dur = 0.42, maxR = 1300) {
  const p = E.inOutCubic(norm(t, t0, t0 + dur));
  const r = lerp(Math.max(10, (origin.r ?? 12) * 1.2), maxR, p);
  node.style.clipPath = `circle(${r.toFixed(1)}px at ${(origin.x - rect.x).toFixed(1)}px ${(origin.y - rect.y).toFixed(1)}px)`;
  return p;
}

// Floor decals -------------------------------------------------------------------------------

function homography(src, dst) {
  const A = [];
  const bvec = [];
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    bvec.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    bvec.push(v);
  }
  for (let c = 0; c < 8; c += 1) {
    let pivot = c;
    for (let r = c + 1; r < 8; r += 1) if (Math.abs(A[r][c]) > Math.abs(A[pivot][c])) pivot = r;
    [A[c], A[pivot]] = [A[pivot], A[c]];
    [bvec[c], bvec[pivot]] = [bvec[pivot], bvec[c]];
    for (let r = c + 1; r < 8; r += 1) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k += 1) A[r][k] -= f * A[c][k];
      bvec[r] -= f * bvec[c];
    }
  }
  const h = new Array(8).fill(0);
  for (let r = 7; r >= 0; r -= 1) {
    let s = bvec[r];
    for (let k = r + 1; k < 8; k += 1) s -= A[r][k] * h[k];
    h[r] = s / A[r][r];
  }
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

// Lay a DOM element (image, logo, card) flat on the world floor so it moves with the camera.
// The element must live outside any CSS perspective container (use the `floor` layer) and have
// transform-origin 0 0. `angle` is the decal's yaw; pass the final camera yaw so it reads upright.
export function placeOnFloor(node, cam, { w, h, worldW, center = [0, 0], angleDeg = 0, z = 0 }) {
  const worldH = (worldW * h) / w;
  const a = (angleDeg * Math.PI) / 180;
  const R = [Math.sin(a), -Math.cos(a)];
  const U = [Math.cos(a), Math.sin(a)];
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => {
    const du = (u - 0.5) * worldW;
    const dv = (v - 0.5) * worldH;
    return [center[0] + R[0] * du - U[0] * dv, center[1] + R[1] * du - U[1] * dv, z];
  });
  const screen = corners.map((p) => project(cam, p));
  if (screen.some((p) => !p)) return false;
  const [a1, b, c, d, e, f, g, hh, i] = homography([[0, 0], [w, 0], [w, h], [0, h]], screen.map((p) => [p.x, p.y]));
  node.style.transform = `matrix3d(${a1}, ${d}, 0, ${g}, ${b}, ${e}, 0, ${hh}, 0, 0, 1, 0, ${c}, ${f}, 0, ${i})`;
  return true;
}

// AI motif -------------------------------------------------------------------------------------

// Dotted thought orb: a Fibonacci sphere with a sweeping scan meridian.
export function drawOrb(ctx, t, size, { ink = [244, 241, 232], accent = [212, 162, 76], n = 110 } = {}) {
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
    const x = Math.cos(a) * rad;
    const z = Math.sin(a) * rad;
    const lon = Math.atan2(z, x);
    const xr = x * Math.cos(rotY) + z * Math.sin(rotY);
    const zr = -x * Math.sin(rotY) + z * Math.cos(rotY);
    const yr = y * Math.cos(tilt) - zr * Math.sin(tilt);
    const zt = y * Math.sin(tilt) + zr * Math.cos(tilt);
    const d0 = Math.abs(Math.atan2(Math.sin(lon + rotY - sweep), Math.cos(lon + rotY - sweep)));
    pts.push({ x: cx + xr * r, y: cy - yr * r, z: zt, d: Math.exp(-(d0 * d0) / 0.08) });
  }
  pts.sort((a, c) => a.z - c.z);
  for (const p of pts) {
    const depth = (p.z + 1) / 2;
    const col = ink.map((v, i) => Math.round(lerp(v, accent[i], p.d)));
    ctx.fillStyle = `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${0.18 + 0.82 * depth})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size * (0.012 + 0.016 * depth + 0.014 * p.d), 0, Math.PI * 2);
    ctx.fill();
  }
}

export function orbCanvas(parent, px) {
  const c = el('canvas', '', parent);
  c.width = px * 2;
  c.height = px * 2;
  css(c, { width: `${px}px`, height: `${px}px`, flex: 'none' });
  return c.getContext('2d');
}

// Shimmer text (see .shimmer in kit.css): slide the gradient each frame.
export function shimmer(node, t, period = 1.8) {
  node.style.backgroundPosition = `${lerp(120, -140, fract(t / period))}% 0`;
}

// Screen feel ----------------------------------------------------------------------------------

// Press feedback for buttons: at most a 4% dip, matching product press states.
export const pressScale = (t, at, depth = 0.04) => 1 - depth * Math.sin(clamp(norm(t, at - 0.05, at + 0.12)) * Math.PI);

// A tap indicator (.tap in kit.css) at a screen point.
export function tapAt(node, t, at, x, y) {
  const p = norm(t, at - 0.14, at + 0.32);
  vis(node, p > 0 && p < 1);
  if (p <= 0 || p >= 1) return;
  const down = E.outCubic(norm(p, 0, 0.3));
  const up = E.outCubic(norm(p, 0.3, 1));
  tf(node, { x, y, s: lerp(1.5, 0.8, down) + up * 0.9, o: clamp(down * 1.4) * (1 - up) });
}

// Enter with a spring, exit with an accelerating fade. Returns { k, out } for composing transforms.
export function enterExit(t, inAt, outAt, { stiffness = 240, damping = 24, outDur = 0.2 } = {}) {
  return { k: spring(t - inAt, { stiffness, damping }), out: E.inCubic(norm(t, outAt - outDur, outAt)) };
}
