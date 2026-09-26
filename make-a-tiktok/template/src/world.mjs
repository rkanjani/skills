// The world and its camera. Swap the preset or write custom geometry to fit the app's domain,
// and rewrite the camera tracks to follow this video's script beat by beat.
import { createWorld, cameraTrack, reveals } from '../lib/world3d.mjs';
import * as worlds from '../lib/worlds.mjs';
import { E, pulse, glide, snap, norm, hexToRgb } from '../lib/core.mjs';
import { CUE, KICKS } from './cues.mjs';

const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function makeWorld(canvas, { brand }) {
  const tokens = brand.tokens ?? {};
  const presetName = brand.world?.preset ?? 'dataGrid';
  const make = worlds[presetName] ?? worlds.dataGrid;
  const preset = make({ paint: tokens.brand, ...(brand.world?.options ?? {}) });
  const { bounds } = preset;
  // At pitch 90 and yaw 0, world x runs up the screen and world y runs across it.
  const endDist = worlds.fitDistance(bounds.y1 - bounds.y0, bounds.x1 - bounds.x0);
  const size = Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0);
  const [f1, f2, f3] = CUE.features;
  const light = luminance(tokens.bg ?? '#000000') > 0.45;

  // The camera travels during scene changes (about 1 s, starting 0.7 s before the cue) and nearly
  // holds while copy is on screen. The logo landing is the one accent snap.
  const camera = cameraTrack(
    {
      dist: [[0, endDist * 0.36], [f1 - 0.7, endDist * 0.31, E.inOutSine], [f1 + 0.3, endDist * 0.45, glide],
        [CUE.payoff - 0.7, endDist * 0.47], [CUE.payoff + 0.3, endDist * 0.52, glide], [CUE.payoffOut - 0.9, endDist * 0.54],
        [CUE.logo - 0.05, endDist * 0.72, E.inOutSine], [CUE.logo + 0.45, endDist, snap], [CUE.end, endDist * 1.05, E.outSine]],
      pitch: [[0, 18], [f1 - 0.7, 22, E.inOutSine], [f1 + 0.3, 42, glide], [CUE.payoff - 0.7, 44], [CUE.payoff + 0.3, 48, glide],
        [CUE.payoffOut - 0.9, 50], [CUE.logo - 0.05, 72, E.inOutSine], [CUE.logo + 0.45, 90, snap], [CUE.end, 90]],
      // A 90 degree turn carries each feature change; the end settles at yaw 360 (screen-up is +x).
      yaw: [[0, -6], [f1 - 0.7, 4, E.inOutSine], [f1 + 0.3, 90, glide], [f2 - 0.7, 95], [f2 + 0.3, 180, glide], [f3 - 0.7, 185],
        [f3 + 0.3, 270, glide], [CUE.payoff - 0.7, 275], [CUE.payoff + 0.3, 300, glide], [CUE.payoffOut - 0.9, 306],
        [CUE.logo - 0.05, 336, E.inOutSine], [CUE.logo + 0.45, 360, snap], [CUE.end, 360]],
      roll: [[0, -3], [f1 - 0.7, 0], [CUE.logo, 0], [CUE.logo + 0.45, -5, snap], [CUE.end, 0, E.outSine]],
      fov: [[0, 44], [f1 + 0.3, 40, glide], [CUE.end, 40]],
    },
    { drift: size / 180, shake: (t) => 0.3 * pulse(t, CUE.hookSlam, 7) + 0.25 * pulse(t, CUE.logo, 7) },
  );

  const energy = (t) => {
    let beat = 0;
    for (const k of KICKS) if (t >= k && t - k < 0.5) beat += 0.22 * pulse(t, k, 9);
    return 0.9 + beat + 1.1 * pulse(t, CUE.logo, 3.2);
  };

  return createWorld(canvas, {
    ...preset,
    camera,
    colors: { bg: tokens.bg, line: tokens.accent, lineCore: tokens.accent, spot: tokens.accent, dust: tokens.ink },
    reveal: reveals.fromCenter({ start: -0.55, speed: size / 2.4, dur: 0.9 }),
    energy,
    blend: light ? 'multiply' : 'lighter',
    dust: light ? { count: 0 } : { count: 110, amount: 0.7, box: [bounds.x0 * 1.2, bounds.x1 * 1.2, bounds.y0 * 1.4, bounds.y1 * 1.4, 1, size * 0.28] },
    overlay: ({ drawRing }, t) => {
      // A shockwave across the floor when the logo lands.
      const p = norm(t, CUE.logo, CUE.logo + 0.9);
      if (p > 0 && p < 1) {
        const r = size * 0.06 + size * 0.75 * E.outCubic(p);
        drawRing(0, 0, r, 10 * (1 - p), `rgba(${hexToRgb(tokens.accent ?? '#ffffff').join(', ')}, ${0.35 * (1 - p)})`);
        drawRing(0, 0, r, 3 * (1 - p) + 1, `rgba(255, 245, 225, ${0.8 * (1 - p)})`);
      }
      // Scenes read this to size floor decals like the logo.
      return { floorSpan: bounds.y1 - bounds.y0 };
    },
  });
}
