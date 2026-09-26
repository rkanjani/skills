// The world layer: a full NBA court in DraftKit gold, seen through a virtual camera.
// Units are feet. Origin is center court, +x runs toward the far basket, z is up.

import { W, H, TOKENS, clamp, lerp, norm, E, track, rng, noise1, pulse, whip, glide, snap } from './core.mjs';
import { CUE, KICKS } from './cues.mjs';

const DEG = Math.PI / 180;
const dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
const cross = (a, c) => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];

// Camera --------------------------------------------------------------------

export function makeCamera({ tx = 0, ty = 0, tz = 0, dist = 100, pitch = 90, yaw = 0, roll = 0, fov = 40 }) {
  const p = pitch * DEG;
  const y = yaw * DEG;
  const r = roll * DEG;
  const f = [Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), -Math.sin(p)];
  let right = [Math.sin(y), -Math.cos(y), 0];
  let up = cross(right, f);
  if (r) {
    const c = Math.cos(r);
    const s = Math.sin(r);
    const r2 = right.map((v, i) => v * c + up[i] * s);
    const u2 = up.map((v, i) => v * c - right[i] * s);
    right = r2;
    up = u2;
  }
  const pos = [tx - f[0] * dist, ty - f[1] * dist, tz - f[2] * dist];
  const F = H / 2 / Math.tan((fov * DEG) / 2);
  return { pos, f, right, up, F, near: 0.6 };
}

function toCam(cam, p) {
  const v = [p[0] - cam.pos[0], p[1] - cam.pos[1], p[2] - cam.pos[2]];
  return [dot(v, cam.right), dot(v, cam.up), dot(v, cam.f)];
}

function camToScreen(cam, c) {
  return { x: W / 2 + (cam.F * c[0]) / c[2], y: H / 2 - (cam.F * c[1]) / c[2], z: c[2], k: cam.F / c[2] };
}

export function project(cam, p) {
  const c = toCam(cam, p);
  if (c[2] < cam.near) return null;
  return camToScreen(cam, c);
}

// Camera path. The camera travels between acts (about 1 s glides) and nearly holds while copy is
// on screen; the hard cut on the drop and the montage whips are the accents.
const CAM_KEYS = {
  tx: [
    [0, 6], [CUE.hookOut, 10, E.inOutSine], [CUE.scan, 24, glide], [CUE.filter3 + 0.2, 25, E.inOutSine],
    [CUE.answer + 0.8, 40.5, glide], [CUE.suck, 41, E.linear], [CUE.drop - 0.001, 41.5, E.inQuad],
    [CUE.drop, 2, E.linear], [CUE.flipOut, -2, E.outQuad], [CUE.stream, 0, glide],
    [CUE.climb, 0, E.linear], [CUE.logo, 0], [CUE.end, 0],
  ],
  ty: [[0, 0], [CUE.answer, 0], [CUE.answer + 0.8, 1.5, glide], [CUE.drop - 0.001, 1.5], [CUE.drop, 0], [CUE.end, 0]],
  dist: [
    [0, 50], [CUE.hookOut, 43, E.inOutSine], [CUE.scan, 118, glide], [CUE.filter3 + 0.2, 112, E.inOutSine],
    [CUE.answer + 0.8, 40, glide], [CUE.add, 36, E.outQuad], [CUE.drop - 0.001, 22, E.inCubic],
    [CUE.drop, 52, E.linear], [CUE.flipOut, 44, E.outSine], [CUE.stream, 62, glide], [CUE.justAsk + 0.3, 60, E.linear],
    [CUE.climb + 0.4, 70, glide], [CUE.logo - 0.05, 96, E.inOutSine], [CUE.logo + 0.45, 138, snap], [CUE.end, 146, E.outSine],
  ],
  pitch: [
    [0, 17], [CUE.hookOut, 21, E.inOutSine], [CUE.ask + 0.8, 50, glide], [CUE.scan, 90, glide],
    [CUE.answer, 90], [CUE.answer + 0.8, 58, glide], [CUE.drop - 0.001, 50, E.inOutSine],
    [CUE.drop, 18, E.linear], [CUE.flipOut, 23, E.outSine], [CUE.stream, 38, glide], [CUE.justAsk + 0.3, 42, E.linear],
    [CUE.climb + 0.4, 40, glide], [CUE.logo - 0.05, 72, E.inOutSine], [CUE.logo + 0.45, 90, snap], [CUE.end, 90],
  ],
  yaw: [
    [0, -4], [CUE.hookOut, 3, E.inOutSine], [CUE.scan, 0, glide], [CUE.answer, 0],
    [CUE.answer + 0.8, -14, glide], [CUE.drop - 0.001, -20, E.inQuad],
    [CUE.drop, 180 + 14, E.linear], [CUE.flipOut, 180 - 4, E.outSine],
    // Montage: a 90 degree whip lands on each word, then a short drift.
    [CUE.stream + 0.2, 180 + 90 - 18, whip], [CUE.sit - 0.25, 180 + 90 - 10, E.linear],
    [CUE.sit + 0.2, 180 + 180 - 18, whip], [CUE.trade - 0.25, 180 + 180 - 10, E.linear],
    [CUE.trade + 0.2, 180 + 270 - 18, whip], [CUE.justAsk - 0.25, 180 + 270 - 10, E.linear],
    [CUE.justAsk + 0.2, 180 + 360 - 18, whip], [CUE.climb - 0.25, 180 + 360 - 10, E.linear],
    [CUE.climb + 0.4, 180 + 360 + 10, glide], [CUE.logo - 0.05, 180 + 360 + 30, E.inOutSine],
    [CUE.logo + 0.45, 180 + 360 + 0, snap], [CUE.end, 540],
  ],
  roll: [
    [0, -3], [CUE.hookOut, 0], [CUE.scan, 0], [CUE.drop - 0.001, -6, E.inQuad],
    [CUE.drop, 7, E.linear], [CUE.flipOut, 0, E.outCubic], [CUE.logo, 0], [CUE.logo + 0.45, -6, snap], [CUE.end, 0, E.outSine],
  ],
  fov: [
    [0, 44], [CUE.scan, 40], [CUE.add, 40], [CUE.drop - 0.001, 64, E.inCubic], [CUE.drop, 46, E.linear],
    [CUE.flipOut, 44], [CUE.logo, 40], [CUE.end, 40],
  ],
};

export function cameraAt(t) {
  const shakeAmp = 0.35 * pulse(t, CUE.drop, 7) + 0.25 * pulse(t, CUE.upSlam, 8) + 0.2 * pulse(t, CUE.logo, 7);
  return makeCamera({
    tx: track(t, CAM_KEYS.tx) + noise1(t * 0.7, 1) * 0.6,
    ty: track(t, CAM_KEYS.ty) + noise1(t * 0.6, 2) * 0.6,
    dist: track(t, CAM_KEYS.dist),
    pitch: track(t, CAM_KEYS.pitch) + noise1(t * 22, 3) * shakeAmp * 2.5,
    yaw: track(t, CAM_KEYS.yaw) + noise1(t * 0.5, 4) * 1.2 + noise1(t * 24, 5) * shakeAmp * 3,
    roll: track(t, CAM_KEYS.roll) + noise1(t * 26, 6) * shakeAmp * 2,
    fov: track(t, CAM_KEYS.fov),
  });
}

// Court geometry -------------------------------------------------------------

function subdivide(points, step = 1.5) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const c = points[i];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k += 1) out.push([lerp(a[0], c[0], k / n), lerp(a[1], c[1], k / n), 0]);
  }
  return out;
}

function arcPts(cx, cy, r, a0, a1) {
  const n = Math.max(8, Math.ceil((Math.abs(a1 - a0) * r) / 1.2));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a), 0];
  });
}

function withLengths(points, extra = {}) {
  const cum = [0];
  for (let i = 1; i < points.length; i += 1) {
    cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const reach = Math.min(...points.map((p) => Math.hypot(p[0], p[1])));
  return { pts: points, cum, len: cum[cum.length - 1], reach, ...extra };
}

function buildCourt() {
  const lines = [];
  const L = 47;
  const Wd = 25;
  lines.push(withLengths(subdivide([[-L, -Wd, 0], [L, -Wd, 0]]), { mode: 'mid' }));
  lines.push(withLengths(subdivide([[-L, Wd, 0], [L, Wd, 0]]), { mode: 'mid' }));
  lines.push(withLengths(subdivide([[-L, -Wd, 0], [-L, Wd, 0]]), { mode: 'mid' }));
  lines.push(withLengths(subdivide([[L, -Wd, 0], [L, Wd, 0]]), { mode: 'mid' }));
  lines.push(withLengths(subdivide([[0, -Wd, 0], [0, Wd, 0]]), { mode: 'mid' }));
  lines.push(withLengths(arcPts(0, 0, 6, -Math.PI, Math.PI), { mode: 'mid', center: true }));
  lines.push(withLengths(arcPts(0, 0, 2, -Math.PI, Math.PI), { mode: 'mid', center: true }));
  for (const s of [1, -1]) {
    const bx = s * 41.75;
    const ft = s * 28;
    // Paint
    lines.push(withLengths(subdivide([[s * L, -8, 0], [ft, -8, 0], [ft, 8, 0], [s * L, 8, 0]]), { mode: 'mid' }));
    lines.push(withLengths(subdivide([[s * L, -6, 0], [ft, -6, 0]]), { mode: 'start', faint: true }));
    lines.push(withLengths(subdivide([[s * L, 6, 0], [ft, 6, 0]]), { mode: 'start', faint: true }));
    // Free throw circle: solid toward midcourt, dashed inside the paint
    const toMid = s > 0 ? Math.PI : 0;
    lines.push(withLengths(arcPts(ft, 0, 6, toMid - Math.PI / 2, toMid + Math.PI / 2), { mode: 'mid' }));
    lines.push(withLengths(arcPts(ft, 0, 6, toMid + Math.PI / 2, toMid + (3 * Math.PI) / 2), { mode: 'mid', dash: true }));
    // Three point line: corner, arc, corner. The arc starts on the y = 22 * s side.
    const theta = Math.asin(22 / 23.75);
    const arc = arcPts(bx, 0, 23.75, toMid - theta, toMid + theta);
    const y0 = 22 * s;
    const three = [
      ...subdivide([[s * L, y0, 0], [s * 33, y0, 0]]),
      ...arc.slice(1),
      ...subdivide([[s * 33, -y0, 0], [s * L, -y0, 0]]).slice(1),
    ];
    lines.push(withLengths(three, { mode: 'mid' }));
    // Restricted area, backboard, rim
    lines.push(withLengths(arcPts(bx, 0, 4, toMid - Math.PI / 2, toMid + Math.PI / 2), { mode: 'mid' }));
    lines.push(withLengths(subdivide([[s * 43, -3, 0], [s * 43, 3, 0]], 0.5), { mode: 'mid', rim: true }));
    lines.push(withLengths(arcPts(bx, 0, 0.75, -Math.PI, Math.PI), { mode: 'mid', rim: true }));
  }
  return lines;
}

// Waiver pool for the league scan ------------------------------------------

export const FINALISTS = [
  { name: 'Tre Jones', tag: 'T. Jones · PG', home: [39.3, 0], pick: true },
  { name: 'Buddy Hield', tag: 'B. Hield · SG', home: [33.8, 10.5] },
  { name: 'Isaiah Jackson', tag: 'I. Jackson · PF/C', home: [33.2, -10.8] },
];

function buildPool() {
  const rand = rng(214);
  const dots = [];
  for (let i = 0; i < 214; i += 1) {
    let x;
    let y;
    let tries = 0;
    do {
      x = 2.5 + rand() * 43.5;
      y = -23.5 + rand() * 47;
      tries += 1;
    } while (tries < 20 && dots.some((d) => Math.hypot(d.x - x, d.y - y) < 1.9));
    dots.push({ x, y, delay: rand() * 0.5, level: 0, seed: rand() * 100 });
  }
  // 38 survive the games-left pass, 3 survive the category pass, 1 is the pick.
  const order = dots.map((d, i) => i).sort((a, c) => (dots[a].seed % 1) - (dots[c].seed % 1));
  order.slice(0, 38).forEach((i) => (dots[i].level = 1));
  const survivors = order.slice(0, 38).sort((a, c) => Math.hypot(dots[a].x - 30, dots[a].y) - Math.hypot(dots[c].x - 30, dots[c].y));
  survivors.slice(0, 3).forEach((i, k) => {
    dots[i].level = k === 0 ? 3 : 2;
    dots[i].finalist = FINALISTS[k];
  });
  return dots;
}

const BASKET = [41.75, 0];
const RING_MAX = 52;
const RING_DUR = 0.6;
const FILTERS = [CUE.filter1, CUE.filter2, CUE.filter3];

function levelAt(dotItem, t) {
  // The scan ring reaches a dot after a delay proportional to its distance from the basket.
  const d = Math.hypot(dotItem.x - BASKET[0], dotItem.y - BASKET[1]);
  let reached = 0;
  let since = 0;
  FILTERS.forEach((ft, k) => {
    const arrive = ft + RING_DUR * E.outCubic(clamp(d / RING_MAX)) * 0.9;
    if (t >= arrive) {
      reached = k + 1;
      since = t - arrive;
    }
  });
  return { reached, since };
}

export function createWorld(canvas) {
  const ctx = canvas.getContext('2d');
  const lines = buildCourt();
  const pool = buildPool();
  const dustRand = rng(77);
  const dust = Array.from({ length: 110 }, () => ({
    x: -60 + dustRand() * 120,
    y: -40 + dustRand() * 80,
    z: 1 + dustRand() * 26,
    s: 0.06 + dustRand() * 0.12,
    ph: dustRand() * 100,
  }));

  function clipPoly(cam, pts) {
    // Sutherland-Hodgman against the near plane in camera space.
    const cs = pts.map((p) => toCam(cam, p));
    const out = [];
    for (let i = 0; i < cs.length; i += 1) {
      const a = cs[i];
      const c = cs[(i + 1) % cs.length];
      const ain = a[2] >= cam.near;
      const cin = c[2] >= cam.near;
      if (ain) out.push(a);
      if (ain !== cin) {
        const k = (cam.near - a[2]) / (c[2] - a[2]);
        out.push([lerp(a[0], c[0], k), lerp(a[1], c[1], k), cam.near]);
      }
    }
    return out.map((c) => camToScreen(cam, c));
  }

  function fillPoly(cam, pts, style) {
    const poly = clipPoly(cam, pts);
    if (poly.length < 3) return;
    ctx.beginPath();
    poly.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = style;
    ctx.fill();
  }

  function strokeSeg(cam, a, c, width, style) {
    let ca = toCam(cam, a);
    let cc = toCam(cam, c);
    if (ca[2] < cam.near && cc[2] < cam.near) return;
    if (ca[2] < cam.near || cc[2] < cam.near) {
      const k = (cam.near - ca[2]) / (cc[2] - ca[2]);
      const m = [lerp(ca[0], cc[0], k), lerp(ca[1], cc[1], k), cam.near];
      if (ca[2] < cam.near) ca = m;
      else cc = m;
    }
    const pa = camToScreen(cam, ca);
    const pc = camToScreen(cam, cc);
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pc.x, pc.y);
    ctx.stroke();
  }

  // Screen-space runs for the portion [s0, s1] (feet along the line), clipped to the near plane.
  function collectRuns(cam, line, s0, s1, widthFt) {
    const { pts, cum } = line;
    const runs = [];
    let run = null;
    const push = (c) => {
      const sp = camToScreen(cam, c);
      if (!run) run = [];
      run.push({ x: sp.x, y: sp.y, w: clamp((widthFt * cam.F) / c[2], 1.3, 11) });
    };
    const end = () => {
      if (run && run.length > 1) runs.push(run);
      run = null;
    };
    for (let i = 1; i < pts.length; i += 1) {
      const a = cum[i - 1];
      const c = cum[i];
      if (c < s0 || a > s1) continue;
      const k0 = clamp((s0 - a) / (c - a));
      const k1 = clamp((s1 - a) / (c - a));
      if (line.dash && Math.floor((a + (c - a) * (k0 + k1) * 0.5) / 1.15) % 2 === 1) {
        end();
        continue;
      }
      const p0 = pts[i - 1];
      const p1 = pts[i];
      let c0 = toCam(cam, [lerp(p0[0], p1[0], k0), lerp(p0[1], p1[1], k0), 0]);
      let c1 = toCam(cam, [lerp(p0[0], p1[0], k1), lerp(p0[1], p1[1], k1), 0]);
      const in0 = c0[2] >= cam.near;
      const in1 = c1[2] >= cam.near;
      if (!in0 && !in1) {
        end();
        continue;
      }
      if (!in0 || !in1) {
        const k = (cam.near - c0[2]) / (c1[2] - c0[2]);
        const m = [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), cam.near];
        if (!in0) {
          end();
          c0 = m;
        } else {
          c1 = m;
        }
      }
      if (!run) push(c0);
      push(c1);
      if (!in1) end();
    }
    end();
    return runs;
  }

  // One fill per pass so overlapping joints never double up under additive blending.
  function fillRuns(runs, mult, style, closed) {
    ctx.beginPath();
    for (const run of runs) {
      const n = run.length;
      const loop = closed && n > 3 && Math.hypot(run[0].x - run[n - 1].x, run[0].y - run[n - 1].y) < 1;
      const pts = loop ? run.slice(0, n - 1) : run;
      const m = pts.length;
      const left = [];
      const right = [];
      for (let i = 0; i < m; i += 1) {
        const p = pts[i];
        const prev = loop ? pts[(i - 1 + m) % m] : pts[i - 1];
        const next = loop ? pts[(i + 1) % m] : pts[i + 1];
        const n1 = prev ? segNormal(prev, p) : null;
        const n2 = next ? segNormal(p, next) : null;
        let nx;
        let ny;
        let scale = 1;
        if (n1 && n2) {
          nx = n1[0] + n2[0];
          ny = n1[1] + n2[1];
          const len = Math.hypot(nx, ny) || 1;
          nx /= len;
          ny /= len;
          scale = 1 / Math.max(0.55, nx * n1[0] + ny * n1[1]);
        } else {
          [nx, ny] = n1 ?? n2 ?? [0, 1];
        }
        const h = ((p.w * mult) / 2) * scale;
        let px = p.x;
        let py = p.y;
        if (!loop && (i === 0 || i === m - 1)) {
          // Square caps so perpendicular lines meet cleanly at corners.
          const ext = (p.w * mult) / 2;
          const sgn = i === 0 ? -1 : 1;
          px += ny * ext * sgn;
          py -= nx * ext * sgn;
        }
        left.push([px + nx * h, py + ny * h]);
        right.push([px - nx * h, py - ny * h]);
      }
      if (loop) {
        left.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
        ctx.closePath();
        for (let i = right.length - 1; i >= 0; i -= 1) {
          if (i === right.length - 1) ctx.moveTo(right[i][0], right[i][1]);
          else ctx.lineTo(right[i][0], right[i][1]);
        }
        ctx.closePath();
      } else {
        left.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
        for (let i = right.length - 1; i >= 0; i -= 1) ctx.lineTo(right[i][0], right[i][1]);
        ctx.closePath();
      }
    }
    ctx.fillStyle = style;
    ctx.fill('nonzero');
  }

  // Draw the portion [s0, s1] of a polyline in three additive passes: bloom, glow, core.
  function drawLine(cam, line, s0, s1, alpha, glow, widthFt = 0.19) {
    if (s1 <= s0 || alpha <= 0.002) return;
    const runs = collectRuns(cam, line, s0, s1, widthFt);
    if (!runs.length) return;
    const closed = s0 <= 1e-6 && s1 >= line.len - 1e-6;
    const passes = [
      [7.5, 0.045 * glow, '212, 162, 76'],
      [2.8, 0.14 * glow, '212, 162, 76'],
      [1, 0.95, '232, 192, 112'],
    ];
    for (const [mult, a, rgb] of passes) {
      const alphaPass = a * alpha;
      if (alphaPass > 0.002) fillRuns(runs, mult, `rgba(${rgb}, ${Math.min(1, alphaPass)})`, closed);
    }
  }

  function lineWindow(line, p) {
    // Draw-on progress p in [0, 1] mapped to a sub-range of the line.
    const len = line.len;
    if (p >= 1) return [0, len];
    if (line.mode === 'start') return [0, len * p];
    const mid = len / 2;
    return [mid - mid * p, mid + mid * p];
  }

  function drawDisc(cam, x, y, rFt, style, z = 0) {
    const p = project(cam, [x, y, z]);
    if (!p) return null;
    const r = Math.max(0.6, rFt * p.k);
    ctx.fillStyle = style;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    return { ...p, r };
  }

  function drawFloorRing(cam, cx, cy, r, width, style) {
    const n = Math.max(24, Math.min(160, Math.ceil(r * 3)));
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const p = project(cam, [cx + r * Math.cos(a), cy + r * Math.sin(a), 0]);
      if (!p) {
        started = false;
        continue;
      }
      if (started) ctx.lineTo(p.x, p.y);
      else ctx.moveTo(p.x, p.y);
      started = true;
    }
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    ctx.stroke();
  }

  function drawPool(cam, t) {
    if (t < CUE.scan - 0.1 || t > CUE.answer + 1.2) return null;
    const appear = (d) => E.outBack(clamp((t - CUE.scan - d.delay) / 0.4), 2.2);
    const fadeAll = 1 - E.inCubic(norm(t, CUE.answer + 0.15, CUE.answer + 0.7));
    let pickScreen = null;
    const labels = [];
    for (const d of pool) {
      const a = appear(d);
      if (a <= 0) continue;
      const { reached, since } = levelAt(d, t);
      const k = E.outCubic(clamp(since / 0.3));
      // Position: finalists glide toward the paint after the category pass.
      let x = d.x;
      let y = d.y;
      if (d.finalist) {
        const glideIn = snap(norm(t, CUE.filter2 + 0.3, CUE.filter3 + 0.1));
        x = lerp(d.x, d.finalist.home[0], glideIn);
        y = lerp(d.y, d.finalist.home[1], glideIn);
        if (d.finalist.pick) {
          const sink = snap(norm(t, CUE.filter3 + 0.35, CUE.filter3 + 1.0));
          x = lerp(x, BASKET[0], sink);
          y = lerp(y, BASKET[1], sink);
        }
      }
      const alive = d.level >= reached;
      let r = 0.5;
      let color = [184, 180, 166];
      let alpha = 0.55;
      if (reached > 0) {
        if (!alive) {
          // Eliminated on this pass: shrink and fade.
          const fromAlpha = reached === 1 ? 0.55 : 0.95;
          alpha = lerp(fromAlpha, 0.1, k);
          r = lerp(reached === 1 ? 0.5 : 0.62, 0.36, k);
          color = reached === 1 ? color : [212, 162, 76];
        } else if (reached === 1) {
          color = [212, 162, 76];
          alpha = lerp(0.55, 0.95, k);
          r = lerp(0.5, 0.62, k);
        } else if (reached === 2) {
          color = [232, 190, 110];
          alpha = 1;
          r = lerp(0.62, 0.78, k);
        } else {
          color = [61, 204, 122];
          alpha = 1;
          r = 0.85;
        }
      }
      alpha *= fadeAll;
      const g = drawDisc(cam, x, y, r * a, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`, 0.05);
      if (!g) continue;
      if (d.finalist && reached >= 2 && alive) {
        const ringA = (reached === 3 ? 0.9 : 0.65) * fadeAll;
        drawFloorRing(cam, x, y, 1.45 + 0.25 * Math.sin(t * 9 + d.seed), 2, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${ringA})`);
        labels.push({ x: g.x, y: g.y, r: g.r, tag: d.finalist.tag, pick: reached === 3, a: fadeAll * E.outCubic(clamp(since / 0.35)) });
      }
      if (d.finalist?.pick) {
        pickScreen = { x: g.x, y: g.y, r: g.r };
        if (reached === 3) {
          for (let w = 0; w < 3; w += 1) {
            const ph = fractTime(t - CUE.filter3 - 0.3 - w * 0.22, 0.66);
            if (ph < 0) continue;
            drawFloorRing(cam, x, y, 1 + ph * 7, 3 * (1 - ph), `rgba(61, 204, 122, ${0.7 * (1 - ph) * fadeAll})`);
          }
        }
      }
    }
    // Scan rings from the basket.
    FILTERS.forEach((ft) => {
      const p = norm(t, ft, ft + RING_DUR);
      if (p <= 0 || p >= 1) return;
      const r = RING_MAX * E.outCubic(p);
      const a = (1 - p) * 0.9;
      drawFloorRing(cam, BASKET[0], BASKET[1], r, 5, `rgba(212, 162, 76, ${a * 0.35})`);
      drawFloorRing(cam, BASKET[0], BASKET[1], r, 2, `rgba(243, 226, 176, ${a})`);
    });
    // Finalist tags.
    ctx.font = '600 25px "IBM Plex Sans"';
    ctx.textBaseline = 'middle';
    for (const l of labels) {
      const text = l.tag;
      const w = ctx.measureText(text).width;
      const bx = l.x + l.r + 26;
      const by = l.y;
      ctx.globalAlpha = l.a;
      ctx.fillStyle = 'rgba(11, 12, 10, 0.86)';
      roundRect(ctx, bx - 14, by - 22, w + 28, 44, 12);
      ctx.fill();
      ctx.strokeStyle = l.pick ? 'rgba(61, 204, 122, 0.55)' : 'rgba(212, 162, 76, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = l.pick ? '#3dcc7a' : '#f4f1e8';
      ctx.fillText(text, bx, by + 1);
      ctx.globalAlpha = 1;
    }
    return pickScreen;
  }

  function drawDust(cam, t, amount) {
    if (amount <= 0) return;
    for (const d of dust) {
      const x = d.x + noise1(t * 0.3 + d.ph, 7) * 3 + t * 0.4;
      const y = d.y + noise1(t * 0.25 + d.ph, 8) * 3;
      const z = d.z + noise1(t * 0.2 + d.ph, 9) * 2;
      const p = project(cam, [x, y, z]);
      if (!p || p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) continue;
      const r = clamp(d.s * p.k, 0.6, 9);
      const a = amount * clamp(0.5 - r / 30) * (0.5 + 0.5 * Math.sin(t * 2 + d.ph));
      ctx.fillStyle = `rgba(244, 230, 200, ${a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function draw(t) {
    const cam = cameraAt(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = TOKENS.bg;
    ctx.fillRect(0, 0, W, H);

    // Floor and painted areas.
    const floorLight = project(cam, [cam.pos[0] + cam.f[0] * 40, cam.pos[1] + cam.f[1] * 40, 0]) ?? { x: W / 2, y: H / 2 };
    fillPoly(cam, [[-47, -25, 0], [47, -25, 0], [47, 25, 0], [-47, 25, 0]], `rgba(19, 20, 16, ${0.55 + 0.45 * E.outCubic(norm(t, -0.4, 1.4))})`);
    const brand = 0.1 + 0.08 * pulse(t, CUE.logo, 2.5);
    const paintIn = E.outCubic(norm(t, 0.35, 1.3));
    for (const s of [1, -1]) {
      fillPoly(cam, [[s * 47, -8, 0], [s * 28, -8, 0], [s * 28, 8, 0], [s * 47, 8, 0]], `rgba(86, 38, 211, ${brand * paintIn})`);
    }
    const circle = Array.from({ length: 48 }, (_, i) => [6 * Math.cos((i / 48) * Math.PI * 2), 6 * Math.sin((i / 48) * Math.PI * 2), 0]);
    fillPoly(cam, circle, `rgba(86, 38, 211, ${brand * 0.9 * E.outCubic(norm(t, -0.3, 0.5))})`);

    // Grid, echoing the landing page court texture.
    const gridA = 0.05;
    ctx.lineWidth = 1;
    for (let gx = -46; gx <= 46; gx += 2) strokeSeg(cam, [gx, -25, 0], [gx, 25, 0], 1, `rgba(212, 162, 76, ${gridA})`);
    for (let gy = -24; gy <= 24; gy += 2) strokeSeg(cam, [-47, gy, 0], [47, gy, 0], 1, `rgba(212, 162, 76, ${gridA})`);

    // Overhead light pool.
    const spot = ctx.createRadialGradient(floorLight.x, floorLight.y, 0, floorLight.x, floorLight.y, 1100);
    spot.addColorStop(0, 'rgba(255, 226, 170, 0.075)');
    spot.addColorStop(1, 'rgba(255, 226, 170, 0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, W, H);

    // Court lines: drawn on from center court at the open, pulsed by the edit.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    let beat = 0;
    for (const k of KICKS) if (t >= k && t - k < 0.5) beat += (k >= CUE.drop ? 0.32 : 0.12) * pulse(t, k, 9);
    const energy = 0.9 + beat + 0.9 * pulse(t, CUE.drop, 5) + 0.6 * pulse(t, CUE.upSlam, 6) + 0.35 * pulse(t, CUE.stream, 7)
      + 0.35 * pulse(t, CUE.sit, 7) + 0.35 * pulse(t, CUE.trade, 7) + 0.35 * pulse(t, CUE.justAsk, 7) + 1.2 * pulse(t, CUE.logo, 3.2);
    const lineAlpha = 0.5;
    const wave = CUE.logo;
    for (const line of lines) {
      const delay = -0.55 + line.reach / 38;
      const p = E.outCubic(norm(t, delay, delay + 0.9));
      if (p <= 0) continue;
      const [s0, s1] = lineWindow(line, p);
      // A bright shock front travels out from center court at the logo hit.
      const front = (t - wave) * 90;
      const hit = t > wave ? Math.exp(-(((line.reach - front) / 10) ** 2)) * pulse(t, wave, 1.6) : 0;
      const a = lineAlpha * (line.faint ? 0.35 : 1) * (1 + hit * 1.3);
      drawLine(cam, line, s0, s1, a, energy + hit * 3, line.rim ? 0.3 : 0.19);
      if (p < 1 && !line.faint) {
        // Leading light on the draw-on.
        for (const s of line.mode === 'start' ? [s1] : [s0, s1]) {
          const idx = line.cum.findIndex((c) => c >= s);
          const q = line.pts[Math.max(0, idx)];
          const g = project(cam, q);
          if (g) {
            const rad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, 34);
            rad.addColorStop(0, `rgba(255, 226, 160, ${0.6 * (1 - p)})`);
            rad.addColorStop(1, 'rgba(255, 226, 160, 0)');
            ctx.fillStyle = rad;
            ctx.fillRect(g.x - 34, g.y - 34, 68, 68);
          }
        }
      }
    }

    // Logo shockwave on the floor.
    const sw = norm(t, CUE.logo, CUE.logo + 0.9);
    if (sw > 0 && sw < 1) {
      const r = 6 + 70 * E.outCubic(sw);
      drawFloorRing(cam, 0, 0, r, 10 * (1 - sw), `rgba(212, 162, 76, ${0.35 * (1 - sw)})`);
      drawFloorRing(cam, 0, 0, r, 3 * (1 - sw) + 1, `rgba(255, 236, 190, ${0.8 * (1 - sw)})`);
    }
    ctx.globalCompositeOperation = 'source-over';

    const pick = drawPool(cam, t);
    ctx.globalCompositeOperation = 'lighter';
    drawDust(cam, t, 0.7);
    ctx.globalCompositeOperation = 'source-over';
    return { cam, pick };
  }

  return { draw };
}

function segNormal(a, c) {
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  return [-dy / len, dx / len];
}

function fractTime(x, period) {
  if (x < 0) return -1;
  return (x % period) / period;
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

