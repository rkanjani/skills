// Drum grooves as data, shared by picture and sound. No Node or DOM imports, so src/cues.mjs can
// derive KICKS for world pulses from the same pattern the soundtrack plays.
//
// Steps are sixteenths inside one bar (0 to 15, fractions allowed). `swing` delays the odd
// sixteenths by that fraction of a step. `roll` is a burst of `n` hats starting at step `at`
// spread over `span` steps.

export const GROOVES = {
  trap: { kick: [0, 6, 11], clap: [8], hat: [0, 2, 4, 6, 8, 10, 12], open: [14], roll: { at: 12, n: 6, span: 4 } },
  phonk: { kick: [0, 3, 8, 10], clap: [8], hat: [0, 2, 4, 6, 8, 10, 12, 14], perc: [0, 3, 6, 10, 13] },
  drill: { kick: [0, 7, 10], clap: [6, 14], hat: [0, 2, 3, 5, 8, 10, 11, 13, 15] },
  halftime: { kick: [0, 10], snare: [8], hat: [0, 4, 8, 12], open: [14] },
  house: { kick: [0, 4, 8, 12], clap: [4, 12], hat: [2, 6, 10, 14], open: [2, 6, 10, 14] },
  disco: { kick: [0, 4, 8, 12], clap: [4, 12], hat: [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15], open: [2, 6, 10, 14] },
  four: { kick: [0, 4, 8, 12], clap: [0, 4, 8, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  garage: { kick: [0, 10], snare: [4, 12], hat: [2, 6, 10, 14], perc: [3, 7, 11, 15], swing: 0.22 },
  jersey: { kick: [0, 4, 8, 11, 14], clap: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  bounce: { kick: [0, 6, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], perc: [3, 7, 9, 14], swing: 0.1 },
  lofi: { kick: [0, 7, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], swing: 0.18 },
  boombap: { kick: [0, 5, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], swing: 0.12 },
  shuffle: { kick: [0, 8], snare: [4, 12], hat: [0, 2.67, 4, 6.67, 8, 10.67, 12, 14.67] },
  breaks: { kick: [0, 10, 11], snare: [4, 12], ghost: [7, 9], hat: [0, 2, 4, 6, 8, 10, 12, 14] },
  dnb: { kick: [0, 10], snare: [4, 12], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
  hyperpop: { kick: [0, 4, 8, 12], clap: [4, 12], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
  synthwave: { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], perc: [13, 14, 15] },
  chip: { kick: [0, 6, 8], snare: [4, 12], hat: [2, 6, 10, 14] },
  stomp: { kick: [0, 3], clap: [8], perc: [12, 14] },
  march: { kick: [0, 8], snare: [4, 6, 7, 12], hat: [] },
  none: {},
};

export const GROOVE_IDS = Object.keys(GROOVES);

// Time of a sixteenth inside a bar, with the groove's swing applied.
export function stepTime(grid, bar, step, swing = 0) {
  const odd = Math.abs((step % 2) - 1) < 0.01;
  return grid.step(bar, step + (odd ? swing : 0));
}

// Kick times for bars [from, to) of a groove: use it for KICKS in src/cues.mjs so the world
// pulses on the hits the soundtrack plays.
export function kickTimes(grid, groove, { from = 0, to = grid.bars, every = 1 } = {}) {
  const g = GROOVES[groove] ?? GROOVES.none;
  const out = [];
  for (let bar = from; bar < to; bar += every) for (const s of g.kick ?? []) out.push(stepTime(grid, bar, s, g.swing ?? 0));
  return out;
}

// Suggested KICKS for an arrangement shape (blocks/arrangement-shapes): the hits the world should
// pulse on. Drumless shapes pulse on downbeats. Edit the result freely in src/cues.mjs.
export function shapeKicks(grid, { groove = 'none', shape = 'build-drop', turn = Math.floor(grid.bars / 2), endBar = grid.bars - 1 } = {}) {
  const end = endBar ?? grid.bars;
  const downbeats = (from, to) => Array.from({ length: Math.max(0, to - from) }, (_, i) => grid.step(from + i, 0));
  const played = (from, to) => {
    const hits = kickTimes(grid, groove, { from, to });
    return hits.length ? hits : downbeats(from, to);
  };
  const last = end < grid.bars ? [grid.step(end, 0)] : [];
  if (shape === 'ui-only') return [];
  if (shape === 'swell') return [...downbeats(0, end), ...last];
  if (shape === 'pulse') return [...downbeats(0, turn), ...downbeats(turn, end).flatMap((t) => [t, t + grid.beat * 2]), ...last];
  if (shape === 'stop-time') return [...downbeats(0, turn), ...played(turn, end), ...last];
  if (shape === 'cold-open') return [...played(0, Math.max(0, turn - 1)), ...played(turn, end), ...last];
  if (shape === 'stomp') return [...played(0, end), ...last];
  return [grid.step(0, 4), ...downbeats(2, Math.max(2, turn - 1)), ...played(turn, end), ...last];
}
