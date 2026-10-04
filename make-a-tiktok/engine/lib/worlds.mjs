// World presets: abstract line-art environments for createWorld() that suit any app. Each returns
// { lines, fills, grid, bounds, landmarks }. Use one as is, or build a custom world for the app
// from `shapes` (segment, polyline, rect, arc, circle) in world3d.mjs. A finance app might use a
// candlestick skyline, a recipe app a cutting-board grid, a travel app a route map.

import { shapes } from './world3d.mjs';

// Distance for a straight-down camera (pitch 90, fov degrees) to frame a width x height region
// in the 9:16 frame with a margin factor.
export function fitDistance(width, height, { fov = 40, margin = 1.08 } = {}) {
  const t = Math.tan((fov * Math.PI) / 360);
  return Math.max((height * margin) / (2 * t), (width * margin) / (2 * t * (1080 / 1920)));
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
