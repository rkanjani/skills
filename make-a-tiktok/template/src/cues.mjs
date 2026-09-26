// Beat map shared by picture and sound. Choose BPM and bars so bars * 240 / bpm is the length, and
// give every scene the time its copy needs (references/motion-craft.md, "Pace and comprehension"):
// 120 BPM x 12 bars = 24.0s, 128 x 16 = 30.0s, 120 x 18 = 36.0s, 128 x 23 = 43.1s. Stay under 45s.
import { beatGrid } from '../lib/core.mjs';

export const grid = beatGrid(120, 12);
const { b } = grid;

// Six scenes of 2 bars (4 s) each: hook, three features, payoff, end card. A scene's `out` cue is
// when it is fully gone; the next scene lands on the following downbeat. Mirror these windows in
// meta.json `scenes` so `studio.mjs check` can confirm each one has time to be read.
export const CUE = {
  hook: 0,
  hookSlam: b(1),
  hookOut: b(7.5),
  features: [b(8), b(16), b(24)],
  payoff: b(32),
  payoffOut: b(39.5),
  logo: b(40),
  tagline: b(41.5),
  cta: b(43),
  end: grid.duration,
};

// Kick hits for the soundtrack and for world pulses (keep both in sync from here): a light build
// under the features, the full groove under the payoff, and one hit for the logo.
export const KICKS = [
  b(1),
  ...[2, 3, 4, 5, 6, 7].flatMap((bar) => (bar % 2 === 0 ? [0, 10] : [6]).map((s) => grid.step(bar, s))),
  ...[8, 9].flatMap((bar) => [0, 6, 11].map((s) => grid.step(bar, s))),
  b(40),
];
