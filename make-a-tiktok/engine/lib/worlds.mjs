// World presets: ready-made line-art environments for createWorld(). Each returns
// { lines, fills, grid, bounds }. Pick one that matches the app's domain, or build a custom world
// from `shapes` (segment, polyline, rect, arc, circle) in world3d.mjs. A finance app might use a
// candlestick skyline, a recipe app a cutting-board grid, a travel app a route map.

import { makeLine, subdivide, arcPoints, shapes } from './world3d.mjs';

// Distance for a straight-down camera (pitch 90, fov degrees) to frame a width x height region
// in the 9:16 frame with a margin factor.
export function fitDistance(width, height, { fov = 40, margin = 1.08 } = {}) {
  const t = Math.tan((fov * Math.PI) / 360);
  return Math.max((height * margin) / (2 * t), (width * margin) / (2 * t * (1080 / 1920)));
}

// NBA full court in feet, centered on center court, +x toward the far basket.
export function basketballCourt({ paint = '#5626d3', paintAlpha = 0.1, floor = '#131410' } = {}) {
  const L = 47;
  const Wd = 25;
  const lines = [
    shapes.segment(-L, -Wd, L, -Wd),
    shapes.segment(-L, Wd, L, Wd),
    shapes.segment(-L, -Wd, -L, Wd),
    shapes.segment(L, -Wd, L, Wd),
    shapes.segment(0, -Wd, 0, Wd),
    shapes.circle(0, 0, 6, { center: true }),
    shapes.circle(0, 0, 2, { center: true }),
  ];
  for (const s of [1, -1]) {
    const bx = s * 41.75;
    const ft = s * 28;
    const toMid = s > 0 ? Math.PI : 0;
    lines.push(makeLine(subdivide([[s * L, -8], [ft, -8], [ft, 8], [s * L, 8]])));
    lines.push(makeLine(subdivide([[s * L, -6], [ft, -6]]), { mode: 'start', faint: true }));
    lines.push(makeLine(subdivide([[s * L, 6], [ft, 6]]), { mode: 'start', faint: true }));
    lines.push(shapes.arc(ft, 0, 6, toMid - Math.PI / 2, toMid + Math.PI / 2));
    lines.push(shapes.arc(ft, 0, 6, toMid + Math.PI / 2, toMid + (3 * Math.PI) / 2, { dash: 1.15 }));
    const theta = Math.asin(22 / 23.75);
    const y0 = 22 * s;
    lines.push(makeLine([
      ...subdivide([[s * L, y0], [s * 33, y0]]),
      ...arcPoints(bx, 0, 23.75, toMid - theta, toMid + theta).slice(1),
      ...subdivide([[s * 33, -y0], [s * L, -y0]]).slice(1),
    ]));
    lines.push(shapes.arc(bx, 0, 4, toMid - Math.PI / 2, toMid + Math.PI / 2));
    lines.push(shapes.segment(s * 43, -3, s * 43, 3, { width: 0.3 }));
    lines.push(shapes.circle(bx, 0, 0.75, { width: 0.3 }));
  }
  const circle = arcPoints(0, 0, 6, -Math.PI, Math.PI).slice(0, -1);
  const fills = [
    { pts: [[-L, -Wd], [L, -Wd], [L, Wd], [-L, Wd]], color: floor, alpha: 1 },
    { pts: [[L, -8], [28, -8], [28, 8], [L, 8]], color: paint, alpha: paintAlpha },
    { pts: [[-L, -8], [-28, -8], [-28, 8], [-L, 8]], color: paint, alpha: paintAlpha },
    { pts: circle, color: paint, alpha: paintAlpha * 0.9 },
  ];
  return {
    lines,
    fills,
    grid: { x0: -46, x1: 46, y0: -24, y1: 24, step: 2, alpha: 0.05 },
    bounds: { x0: -L, x1: L, y0: -Wd, y1: Wd },
    landmarks: { center: [0, 0], basket: [41.75, 0], otherBasket: [-41.75, 0] },
  };
}

// Soccer pitch in meters, 105 x 68, centered.
export function soccerPitch({ floor = '#10140f', paint = null, paintAlpha = 0.08 } = {}) {
  const L = 52.5;
  const Wd = 34;
  const lines = [
    shapes.rect(-L, -Wd, L, Wd),
    shapes.segment(0, -Wd, 0, Wd),
    shapes.circle(0, 0, 9.15, { center: true }),
    shapes.circle(0, 0, 0.3, { width: 0.4 }),
  ];
  for (const s of [1, -1]) {
    lines.push(makeLine(subdivide([[s * L, -20.15], [s * (L - 16.5), -20.15], [s * (L - 16.5), 20.15], [s * L, 20.15]])));
    lines.push(makeLine(subdivide([[s * L, -9.16], [s * (L - 5.5), -9.16], [s * (L - 5.5), 9.16], [s * L, 9.16]])));
    const spot = s * (L - 11);
    const a = Math.acos(5.5 / 9.15);
    lines.push(shapes.arc(spot, 0, 9.15, (s > 0 ? Math.PI : 0) - a, (s > 0 ? Math.PI : 0) + a));
    lines.push(shapes.circle(spot, 0, 0.3, { width: 0.4 }));
    for (const c of [-1, 1]) {
      const base = s > 0 ? (c > 0 ? Math.PI : Math.PI / 2) : c > 0 ? -Math.PI / 2 : 0;
      lines.push(shapes.arc(s * L, c * Wd, 1, base, base + Math.PI / 2));
    }
  }
  const fills = [{ pts: [[-L, -Wd], [L, -Wd], [L, Wd], [-L, Wd]], color: floor, alpha: 1 }];
  if (paint) fills.push({ pts: arcPoints(0, 0, 9.15, -Math.PI, Math.PI).slice(0, -1), color: paint, alpha: paintAlpha });
  return {
    lines,
    fills,
    grid: { x0: -50, x1: 50, y0: -32, y1: 32, step: 4, alpha: 0.04 },
    bounds: { x0: -L, x1: L, y0: -Wd, y1: Wd },
    landmarks: { center: [0, 0], goal: [L, 0], otherGoal: [-L, 0] },
  };
}

// 400 m running track in meters with lanes.
export function runningTrack({ lanes = 6, floor = '#12110f' } = {}) {
  const straight = 84.39;
  const r0 = 36.5;
  const laneW = 1.22;
  const lines = [];
  for (let i = 0; i <= lanes; i += 1) {
    const r = r0 + i * laneW;
    const h = straight / 2;
    lines.push(makeLine([
      ...subdivide([[-h, -r], [h, -r]]),
      ...arcPoints(h, 0, r, -Math.PI / 2, Math.PI / 2).slice(1),
      ...subdivide([[h, r], [-h, r]]).slice(1),
      ...arcPoints(-h, 0, r, Math.PI / 2, (3 * Math.PI) / 2).slice(1),
    ], { mode: 'start', faint: i > 0 && i < lanes }));
  }
  lines.push(shapes.segment(0, -r0, 0, -(r0 + lanes * laneW), { width: 0.5 }));
  const outer = r0 + lanes * laneW;
  return {
    lines,
    fills: [{ pts: [[-straight / 2 - outer, -outer], [straight / 2 + outer, -outer], [straight / 2 + outer, outer], [-straight / 2 - outer, outer]], color: floor, alpha: 0.6 }],
    grid: null,
    bounds: { x0: -straight / 2 - outer, x1: straight / 2 + outer, y0: -outer, y1: outer },
    landmarks: { finish: [0, -r0] },
  };
}

// Abstract data floor: a fine grid with brighter major lines and a few rings. Works for any app.
export function dataGrid({ size = 120, minor = 4, major = 20, rings = [12, 24, 36] } = {}) {
  const h = size / 2;
  const lines = [];
  for (let v = -h; v <= h + 1e-6; v += major) {
    lines.push(shapes.segment(v, -h, v, h, { faint: Math.abs(v) > 1e-6 }));
    lines.push(shapes.segment(-h, v, h, v, { faint: Math.abs(v) > 1e-6 }));
  }
  for (const r of rings) lines.push(shapes.circle(0, 0, r, { dash: r > 20 ? 2 : 0 }));
  return {
    lines,
    fills: [],
    grid: { x0: -h, x1: h, y0: -h, y1: h, step: minor, alpha: 0.05 },
    bounds: { x0: -h, x1: h, y0: -h, y1: h },
    landmarks: { center: [0, 0] },
  };
}

// Concentric target rings with crosshairs: radar, focus, goals, aim.
export function targetRings({ count = 6, spacing = 6 } = {}) {
  const lines = [];
  for (let i = 1; i <= count; i += 1) lines.push(shapes.circle(0, 0, i * spacing, { faint: i % 2 === 0 }));
  const R = count * spacing + spacing;
  lines.push(shapes.segment(-R, 0, R, 0, { faint: true }));
  lines.push(shapes.segment(0, -R, 0, R, { faint: true }));
  return {
    lines,
    fills: [],
    grid: { x0: -R, x1: R, y0: -R, y1: R, step: spacing / 2, alpha: 0.03 },
    bounds: { x0: -R, x1: R, y0: -R, y1: R },
    landmarks: { center: [0, 0] },
  };
}
