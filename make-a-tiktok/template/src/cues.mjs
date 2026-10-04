// Beat map shared by picture and sound. Choose BPM and bars so bars * 240 / bpm is the length, and
// give every scene the time its copy needs (references/motion-craft.md, "Pace and comprehension"):
// 120 BPM x 12 bars = 24.0s, 128 x 16 = 30.0s, 120 x 18 = 36.0s, 128 x 23 = 43.1s. Stay under 45s.
import { beatGrid } from '../lib/core.mjs';
import { shapeKicks } from '../lib/grooves.mjs';

export const grid = beatGrid(120, 12);
const { b } = grid;

// The sound plan for the picture side: the groove and arrangement shape from meta.json `sound`
// (`studio sound <id>` designs it and `studio new` writes it here), the bar where the story turns,
// and the bar of the final chord. Keep groove and shape equal to meta.json; `studio check` compares.
export const SOUND = { groove: 'house', shape: 'build-drop', turn: 8, endBar: 10 };

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

// Kick hits for the soundtrack and for world pulses, from the same groove the soundtrack plays.
// `shapeKicks` suggests a list for the arrangement shape; add or remove hits to fit the scenes.
export const KICKS = [b(1), ...shapeKicks(grid, SOUND).filter((t) => t > b(1) + 0.01)];
