// The world layer: glowing line-art geometry on a floor plane, seen through a moving 3D camera.
// Units are arbitrary world units (the court presets use feet). z is up, the floor is z = 0.
//
// A continuous camera move through one world is the strongest way to make a short piece feel
// like a single designed film instead of a slideshow. Scenes float UI above this layer.

import { W, H, clamp, lerp, norm, E, track, noise1, hexToRgb } from './core.mjs';

const DEG = Math.PI / 180;
const dot3 = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
const cross = (a, c) => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];

// Camera -------------------------------------------------------------------------------------
// Orbit parameterization around a target on the floor. pitch 90 looks straight down; yaw 0 faces +x
// (and at pitch 90, screen-up is +x). roll rotates the image. dist is distance from the target.
export function makeCamera({ tx = 0, ty = 0, tz = 0, dist = 100, pitch = 90, yaw = 0, roll = 0, fov = 40 } = {}) {
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
  return { pos, f, right, up, F: H / 2 / Math.tan((fov * DEG) / 2), near: 0.6, yaw, pitch, roll };
}

export function toCam(cam, p) {
  const v = [p[0] - cam.pos[0], p[1] - cam.pos[1], (p[2] ?? 0) - cam.pos[2]];
  return [dot3(v, cam.right), dot3(v, cam.up), dot3(v, cam.f)];
}

export function camToScreen(cam, c) {
  return { x: W / 2 + (cam.F * c[0]) / c[2], y: H / 2 - (cam.F * c[1]) / c[2], z: c[2], k: cam.F / c[2] };
}

// Screen position of a world point, or null when it is behind the camera.
export function project(cam, p) {
  const c = toCam(cam, p);
  if (c[2] < cam.near) return null;
  return camToScreen(cam, c);
}

const CAMERA_DEFAULTS = { tx: 0, ty: 0, tz: 0, dist: 100, pitch: 90, yaw: 0, roll: 0, fov: 40 };

// Build a camera function from keyframe tracks: { dist: [[t, v, ease], ...], pitch: [...] }.
// Optional shake(t) returns an amplitude that adds deterministic handheld jitter on impacts.
export function cameraTrack(keys, { drift = 0.6, shake = () => 0 } = {}) {
  return (t) => {
    const params = {};
    for (const [axis, fallback] of Object.entries(CAMERA_DEFAULTS)) {
      params[axis] = keys[axis] ? track(t, keys[axis]) : fallback;
    }
    const amp = shake(t);
    params.tx += noise1(t * 0.7, 1) * drift;
    params.ty += noise1(t * 0.6, 2) * drift;
    params.pitch += noise1(t * 22, 3) * amp * 2.5;
    params.yaw += noise1(t * 0.5, 4) * drift * 2 + noise1(t * 24, 5) * amp * 3;
    params.roll += noise1(t * 26, 6) * amp * 2;
    return params;
  };
}

// Geometry ----------------------------------------------------------------------------------

export function subdivide(points, step = 1.5) {
  const out = [[points[0][0], points[0][1], points[0][2] ?? 0]];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const c = points[i];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 1; k <= n; k += 1) out.push([lerp(a[0], c[0], k / n), lerp(a[1], c[1], k / n), 0]);
  }
  return out;
}

export function arcPoints(cx, cy, r, a0, a1, step = 0.6) {
  const n = Math.max(24, Math.ceil((Math.abs(a1 - a0) * r) / step));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a), 0];
  });
}

// A drawable line: points plus cumulative lengths. `mode` controls draw-on: 'start' grows from the
// first point, 'mid' grows outward from the middle. `reach` (distance to origin) drives radial reveals.
export function makeLine(points, meta = {}) {
  const cum = [0];
  for (let i = 1; i < points.length; i += 1) {
    cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  }
  const reach = Math.min(...points.map((p) => Math.hypot(p[0], p[1])));
  return { pts: points, cum, len: cum[cum.length - 1], reach, mode: 'mid', ...meta };
}

export const shapes = {
  segment: (x0, y0, x1, y1, meta) => makeLine(subdivide([[x0, y0], [x1, y1]]), meta),
  polyline: (pts, meta) => makeLine(subdivide(pts), meta),
  rect: (x0, y0, x1, y1, meta) => makeLine(subdivide([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]), meta),
  arc: (cx, cy, r, a0, a1, meta) => makeLine(arcPoints(cx, cy, r, a0, a1), meta),
  circle: (cx, cy, r, meta) => makeLine(arcPoints(cx, cy, r, -Math.PI, Math.PI), meta),
};

// Reveal helpers: return (line, t) => progress in [0, 1].
export const reveals = {
  all: () => () => 1,
  // Lines draw on outward from the origin, already moving at `start` so frame zero is never empty.
  fromCenter: ({ start = -0.55, speed = 38, dur = 0.9 } = {}) => (line, t) => {
    const delay = start + line.reach / speed;
    return E.outCubic(norm(t, delay, delay + dur));
  },
  at: (time, dur = 0.8) => (line, t) => E.outCubic(norm(t, time + (line.delay ?? 0), time + (line.delay ?? 0) + dur)),
};

// Run several world overlays (e.g. a scan block plus a shockwave) and merge what they return.
export const composeOverlays = (...overlays) => (api, t) =>
  overlays.filter(Boolean).reduce((acc, overlay) => ({ ...acc, ...(overlay(api, t) ?? {}) }), {});

// Renderer -----------------------------------------------------------------------------------

export function createWorld(canvas, options) {
  const {
    lines = [],
    fills = [],
    grid = null,
    camera,
    colors = {},
    reveal = reveals.all(),
    energy = () => 1,
    lineAlpha = () => 1,
    lineWidth = 0.19,
    dust = { count: 110, amount: 0.7, box: [-60, 60, -40, 40, 1, 27] },
    spot = true,
    overlay = null,
    // 'lighter' (additive glow) for dark worlds; 'multiply' or 'source-over' for light brands.
    blend = 'lighter',
  } = options;
  const ctx = canvas.getContext('2d');
  const bg = colors.bg ?? '#0b0c0a';
  const lineRgb = hexToRgb(colors.line ?? '#d4a24c').join(', ');
  const coreRgb = hexToRgb(colors.lineCore ?? colors.line ?? '#e8c070').join(', ');
  const spotRgb = hexToRgb(colors.spot ?? '#ffe2aa').join(', ');
  const dustRgb = hexToRgb(colors.dust ?? '#f4e6c8').join(', ');

  let seed = 77;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const [dx0, dx1, dy0, dy1, dz0, dz1] = dust?.box ?? [-60, 60, -40, 40, 1, 27];
  const motes = Array.from({ length: dust?.count ?? 0 }, () => ({
    x: dx0 + rand() * (dx1 - dx0),
    y: dy0 + rand() * (dy1 - dy0),
    z: dz0 + rand() * (dz1 - dz0),
    s: 0.06 + rand() * 0.12,
    ph: rand() * 100,
  }));

  function clipPoly(cam, pts) {
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

  // Screen-space runs for [s0, s1] of a line, clipped against the near plane.
  function collectRuns(cam, line, s0, s1, widthWorld) {
    const { pts, cum } = line;
    const runs = [];
    let run = null;
    const push = (c) => {
      const sp = camToScreen(cam, c);
      if (!run) run = [];
      run.push({ x: sp.x, y: sp.y, w: clamp((widthWorld * cam.F) / c[2], 1.3, 11) });
    };
    const end = () => {
      if (run && run.length > 1) runs.push(run);
      run = null;
    };
    for (let i = 1; i < pts.length; i += 1) {
      const a = cum[i - 1];
      const c = cum[i];
      if (c < s0 || a > s1) continue;
      const k0 = clamp((s0 - a) / (c - a || 1));
      const k1 = clamp((s1 - a) / (c - a || 1));
      if (line.dash && Math.floor((a + (c - a) * (k0 + k1) * 0.5) / line.dash) % 2 === 1) {
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

  function segNormal(a, c) {
    const dx = c.x - a.x;
    const dy = c.y - a.y;
    const len = Math.hypot(dx, dy);
    return len < 1e-6 ? null : [-dy / len, dx / len];
  }

  // Each pass is one fill, so joints never double up under additive blending (no beading).
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
          const ext = (p.w * mult) / 2;
          const sgn = i === 0 ? -1 : 1;
          px += ny * ext * sgn;
          py -= nx * ext * sgn;
        }
        left.push([px + nx * h, py + ny * h]);
        right.push([px - nx * h, py - ny * h]);
      }
      left.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      if (loop) {
        ctx.closePath();
        for (let i = right.length - 1; i >= 0; i -= 1) {
          if (i === right.length - 1) ctx.moveTo(right[i][0], right[i][1]);
          else ctx.lineTo(right[i][0], right[i][1]);
        }
        ctx.closePath();
      } else {
        for (let i = right.length - 1; i >= 0; i -= 1) ctx.lineTo(right[i][0], right[i][1]);
        ctx.closePath();
      }
    }
    ctx.fillStyle = style;
    ctx.fill('nonzero');
  }

  // Draw [s0, s1] of a line in three additive passes: bloom, glow, core.
  function drawLine(cam, line, s0, s1, alpha, glow, widthWorld = lineWidth) {
    if (s1 <= s0 || alpha <= 0.002) return;
    const runs = collectRuns(cam, line, s0, s1, widthWorld);
    if (!runs.length) return;
    const closed = s0 <= 1e-6 && s1 >= line.len - 1e-6;
    const rgb = line.color ? hexToRgb(line.color).join(', ') : lineRgb;
    const core = line.color ? rgb : coreRgb;
    for (const [mult, a, c] of [[7.5, 0.045 * glow, rgb], [2.8, 0.14 * glow, rgb], [1, 0.95, core]]) {
      const pa = a * alpha;
      if (pa > 0.002) fillRuns(runs, mult, `rgba(${c}, ${Math.min(1, pa)})`, closed);
    }
  }

  function lineWindow(line, p) {
    if (p >= 1) return [0, line.len];
    if (line.mode === 'start') return [0, line.len * p];
    const mid = line.len / 2;
    return [mid - mid * p, mid + mid * p];
  }

  function drawDisc(cam, x, y, radius, style, z = 0) {
    const p = project(cam, [x, y, z]);
    if (!p) return null;
    const r = Math.max(0.6, radius * p.k);
    ctx.fillStyle = style;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    return { ...p, r };
  }

  function drawRing(cam, cx, cy, r, width, style) {
    const n = Math.max(24, Math.min(180, Math.ceil(r * 3)));
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

  // Text that sits in screen space next to a world point, on a dark pill for legibility.
  function label(cam, text, x, y, { font = '600 25px sans-serif', color = '#f4f1e8', border = null, dx = 26, alpha = 1 } = {}) {
    const p = project(cam, [x, y, 0]);
    if (!p || alpha <= 0) return;
    ctx.font = font;
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width;
    const bx = p.x + dx;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(11, 12, 10, 0.86)';
    ctx.beginPath();
    ctx.roundRect(bx - 14, p.y - 22, w + 28, 44, 12);
    ctx.fill();
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = color;
    ctx.fillText(text, bx, p.y + 1);
    ctx.globalAlpha = 1;
  }

  function draw(t) {
    const cam = makeCamera(camera(t));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    for (const f of fills) {
      const a = typeof f.alpha === 'function' ? f.alpha(t) : f.alpha ?? 1;
      if (a <= 0.002) continue;
      const [r, g, b] = hexToRgb(f.color);
      fillPoly(cam, f.pts, `rgba(${r}, ${g}, ${b}, ${a})`);
    }

    if (grid) {
      const { x0, x1, y0, y1, step = 2, alpha = 0.05 } = grid;
      const style = `rgba(${lineRgb}, ${typeof alpha === 'function' ? alpha(t) : alpha})`;
      for (let gx = x0; gx <= x1 + 1e-6; gx += step) strokeSeg(cam, [gx, y0, 0], [gx, y1, 0], 1, style);
      for (let gy = y0; gy <= y1 + 1e-6; gy += step) strokeSeg(cam, [x0, gy, 0], [x1, gy, 0], 1, style);
    }

    if (spot) {
      const target = project(cam, [cam.pos[0] + cam.f[0] * 40, cam.pos[1] + cam.f[1] * 40, 0]) ?? { x: W / 2, y: H / 2 };
      const g = ctx.createRadialGradient(target.x, target.y, 0, target.x, target.y, 1100);
      g.addColorStop(0, `rgba(${spotRgb}, 0.075)`);
      g.addColorStop(1, `rgba(${spotRgb}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.globalCompositeOperation = blend;
    const e = energy(t);
    for (const line of lines) {
      const p = reveal(line, t);
      if (p <= 0) continue;
      const [s0, s1] = lineWindow(line, p);
      drawLine(cam, line, s0, s1, 0.5 * (line.faint ? 0.35 : 1) * lineAlpha(line, t), e, line.width ?? lineWidth);
      if (p < 1 && !line.faint) {
        // Leading light on the draw-on head.
        for (const s of line.mode === 'start' ? [s1] : [s0, s1]) {
          const idx = line.cum.findIndex((c) => c >= s);
          const g = project(cam, line.pts[Math.max(0, idx)]);
          if (!g) continue;
          const rad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, 34);
          rad.addColorStop(0, `rgba(${coreRgb}, ${0.6 * (1 - p)})`);
          rad.addColorStop(1, `rgba(${coreRgb}, 0)`);
          ctx.fillStyle = rad;
          ctx.fillRect(g.x - 34, g.y - 34, 68, 68);
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    const api = {
      ctx,
      cam,
      project: (p) => project(cam, p),
      drawDisc: (...a) => drawDisc(cam, ...a),
      drawRing: (...a) => drawRing(cam, ...a),
      drawLine: (line, s0, s1, alpha = 0.5, glow = 1, width = lineWidth) => drawLine(cam, line, s0, s1, alpha, glow, width),
      fillPoly: (pts, style) => fillPoly(cam, pts, style),
      label: (...a) => label(cam, ...a),
    };
    const extra = overlay ? overlay(api, t) ?? {} : {};

    if (motes.length && dust.amount > 0 && blend === 'lighter') {
      ctx.globalCompositeOperation = 'lighter';
      for (const d of motes) {
        const x = d.x + noise1(t * 0.3 + d.ph, 7) * 3 + t * 0.4;
        const y = d.y + noise1(t * 0.25 + d.ph, 8) * 3;
        const z = d.z + noise1(t * 0.2 + d.ph, 9) * 2;
        const p = project(cam, [x, y, z]);
        if (!p || p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) continue;
        const r = clamp(d.s * p.k, 0.6, 9);
        const a = dust.amount * clamp(0.5 - r / 30) * (0.5 + 0.5 * Math.sin(t * 2 + d.ph));
        ctx.fillStyle = `rgba(${dustRgb}, ${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    return { cam, ...extra };
  }

  return { draw };
}
