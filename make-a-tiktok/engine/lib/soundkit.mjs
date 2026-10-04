// Per-video sound identity (Node). synth.mjs has one timbre per instrument, so two videos built
// from it sound like the same record. A kit is a seeded design: a family of instruments, a key and
// mode, a chord path, a groove, an arrangement shape, and a matching set of sound-design voices.
// The same spec always designs the same kit, and any field you set overrides the seeded choice.
//
//   const kit = designKit(meta.sound ?? { seed: hashSeed('app/007-slug') });
//   arrange(mix, grid, { kit, turn: 8, kicks: KICKS });     // blocks/arrangement-shapes
//   kit.sfx.impact(mix, CUE.hook);                          // sound design in this video's voice
//   kit.playMotif(mix, CUE.logo + 0.3, { step: grid.beat / 2 });   // the app's sonic logo
//
// `kit.spec` is JSON-safe: `studio sound <id>` stores it in meta.json so the checker can compare
// it with previous videos.

import { SR, secs, osc, filter, noise, env, expDecay, sat, mixInto, noteHz, clamp, inst } from './synth.mjs';
import { GROOVES, stepTime } from './grooves.mjs';

const TAU = Math.PI * 2;

// Seeded choices -----------------------------------------------------------------------------------

export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Theory -------------------------------------------------------------------------------------------

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
};

// Chord paths as scale degrees, one chord per bar.
export const PATHS = {
  major: [[1, 5, 6, 4], [1, 4, 5, 4], [6, 4, 1, 5], [1, 6, 4, 5], [4, 5, 3, 6], [2, 5, 1, 6], [1, 3, 4, 5]],
  minor: [[1, 6, 3, 7], [1, 4, 6, 5], [1, 7, 6, 7], [6, 7, 1, 1], [1, 3, 4, 6], [1, 6, 4, 5], [4, 1, 5, 1]],
  dorian: [[1, 4, 1, 4], [1, 7, 4, 1], [1, 2, 4, 1], [1, 4, 7, 3]],
  phrygian: [[1, 2, 1, 2], [1, 2, 7, 1], [1, 6, 2, 1]],
  mixolydian: [[1, 7, 4, 1], [1, 4, 7, 4], [1, 5, 7, 4]],
  lydian: [[1, 2, 1, 2], [1, 2, 6, 5], [1, 5, 2, 6]],
  harmonicMinor: [[1, 5, 1, 5], [1, 6, 5, 5], [1, 4, 5, 1]],
};

// MIDI note of a 1-based scale degree; degrees above 7 continue into the next octave.
export function scaleMidi(key, mode, degree, base = 60) {
  const scale = MODES[mode] ?? MODES.minor;
  const i = degree - 1;
  return base + key + scale[((i % 7) + 7) % 7] + 12 * Math.floor(i / 7);
}

const fold = (midi, lo, hi) => {
  let m = midi;
  while (m < lo) m += 12;
  while (m > hi) m -= 12;
  return m;
};

// Diatonic chord on a degree, voiced close around middle C: root, third, fifth, then the seventh
// or the octave.
export function chordOn(key, mode, degree, sevenths = false) {
  const root = fold(scaleMidi(key, mode, degree, 48), 48, 59);
  const shift = root - scaleMidi(key, mode, degree, 48);
  const tone = (step) => scaleMidi(key, mode, degree + step, 48) + shift;
  return [root, tone(2), tone(4), sevenths ? tone(6) : root + 12];
}

// Families -----------------------------------------------------------------------------------------
// Each family is a small world of instruments that belong together. A kit picks one option from
// every list, so two kits in the same family still differ.

export const FAMILIES = {
  sub808: {
    about: 'tuned 808, dark pads, crisp trap kit',
    grooves: ['trap', 'drill', 'phonk', 'halftime'], modes: ['minor', 'phrygian', 'harmonicMinor'],
    bass: ['sub808'], chord: ['supersaw', 'darkPad', 'glass'], lead: ['bell', 'pluck', 'square'],
    snare: ['clap', 'snare'], hat: ['closed', 'tight'], perc: ['cowbell', 'rim', 'tom'], kick: 'deep',
    bassPattern: ['hold', 'syncop'], shapes: ['build-drop', 'stop-time', 'cold-open'],
    impact: ['boom', 'slam'], whoosh: ['sweep', 'tape'], tick: ['click', 'blip'], confirm: ['bell', 'coin'], riser: ['noise', 'reverse'],
    sevenths: [false], bpm: [126, 145],
  },
  dusty: {
    about: 'soft keys, round bass, swung dusty drums',
    grooves: ['lofi', 'boombap', 'shuffle'], modes: ['dorian', 'minor', 'major', 'lydian'],
    bass: ['round', 'pluckBass'], chord: ['keys', 'piano', 'organ'], lead: ['musicbox', 'whistle', 'mallet'],
    snare: ['snare', 'brush', 'rim'], hat: ['closed', 'shaker'], perc: ['rim', 'woodblock', 'snap'], kick: 'soft',
    bassPattern: ['root-fifth', 'two', 'hold'], shapes: ['cold-open', 'build-drop', 'pulse', 'stop-time'],
    impact: ['thud', 'bloom', 'stamp'], whoosh: ['air', 'paper'], tick: ['tock', 'key', 'pop'], confirm: ['mallet', 'bell', 'chime'], riser: ['reverse', 'none'],
    sevenths: [true], bed: 'vinyl', bpm: [78, 98],
  },
  club: {
    about: 'four-on-the-floor kick, offbeat bass, stabs and plucks',
    grooves: ['house', 'disco', 'four', 'garage', 'jersey'], modes: ['minor', 'dorian', 'major', 'mixolydian'],
    bass: ['fm', 'pluckBass', 'round'], chord: ['organ', 'pluck', 'supersaw', 'keys'], lead: ['pluck', 'bell', 'square'],
    snare: ['clap', 'snare'], hat: ['closed', 'tight', 'shaker'], perc: ['rim', 'conga', 'snap'], kick: 'punchy',
    bassPattern: ['offbeat', 'pulse8', 'syncop'], shapes: ['build-drop', 'cold-open', 'stop-time'],
    impact: ['boom', 'slam', 'thud'], whoosh: ['sweep', 'air', 'tonal'], tick: ['click', 'pop', 'blip'], confirm: ['pluck', 'bell', 'coin'], riser: ['noise', 'reverse', 'tonal'],
    sevenths: [false, true], bpm: [118, 132],
  },
  mallet: {
    about: 'marimba and kalimba, hand percussion, warm and playful',
    grooves: ['bounce', 'shuffle', 'stomp', 'garage'], modes: ['major', 'lydian', 'mixolydian', 'dorian'],
    bass: ['round', 'pluckBass'], chord: ['mallet', 'pluck', 'organ'], lead: ['mallet', 'whistle', 'pizz'],
    snare: ['snap', 'rim', 'brush'], hat: ['shaker'], perc: ['woodblock', 'conga', 'snap'], kick: 'soft',
    bassPattern: ['two', 'root-fifth', 'syncop'], shapes: ['cold-open', 'pulse', 'stop-time', 'stomp'],
    impact: ['thud', 'timpani', 'stamp'], whoosh: ['air', 'paper'], tick: ['tock', 'pop', 'drop'], confirm: ['mallet', 'chime'], riser: ['none', 'reverse'],
    sevenths: [false, true], bpm: [96, 124],
  },
  chip: {
    about: 'square leads, triangle bass, noise drums: 8-bit',
    grooves: ['chip', 'four', 'breaks', 'bounce'], modes: ['major', 'minor', 'mixolydian'],
    bass: ['tri'], chord: ['pulse'], lead: ['square'],
    snare: ['noise'], hat: ['chip'], perc: ['woodblock'], kick: 'chip',
    bassPattern: ['pulse8', 'root-fifth', 'offbeat'], shapes: ['cold-open', 'build-drop', 'stop-time'],
    impact: ['slam', 'thud'], whoosh: ['tonal', 'tape'], tick: ['blip', 'pop'], confirm: ['coin'], riser: ['tonal'],
    sevenths: [false], bpm: [120, 160],
  },
  cinematic: {
    about: 'strings and brass that swell, timpani hits, little or no drum kit',
    grooves: ['none', 'halftime', 'march'], modes: ['minor', 'harmonicMinor', 'lydian', 'dorian'],
    bass: ['round', 'sub808'], chord: ['strings', 'brass'], lead: ['pizz', 'bell', 'whistle'],
    snare: ['snare', 'gated'], hat: ['shaker', 'closed'], perc: ['tom'], kick: 'deep',
    bassPattern: ['hold', 'two'], shapes: ['swell', 'build-drop', 'stop-time'],
    impact: ['timpani', 'boom', 'slam'], whoosh: ['air', 'sweep'], tick: ['click', 'tock'], confirm: ['chime', 'bell'], riser: ['reverse', 'tonal'],
    sevenths: [false], bpm: [84, 128],
  },
  glass: {
    about: 'glassy pads and bells over a slow pulse, no drums',
    grooves: ['none'], modes: ['lydian', 'major', 'dorian', 'mixolydian'],
    bass: ['round'], chord: ['glass', 'strings'], lead: ['whistle', 'bell', 'musicbox'],
    snare: ['rim'], hat: ['shaker'], perc: ['woodblock'], kick: 'soft',
    bassPattern: ['hold', 'two'], shapes: ['pulse', 'swell'],
    impact: ['bloom', 'thud'], whoosh: ['air', 'tonal'], tick: ['drop', 'pop'], confirm: ['chime', 'bell'], riser: ['none', 'reverse'],
    sevenths: [true], bpm: [90, 120],
  },
  retro: {
    about: 'synthwave: driving bass eighths, gated snare, brassy pads',
    grooves: ['synthwave', 'disco', 'four'], modes: ['minor', 'dorian'],
    bass: ['reese', 'pluckBass'], chord: ['brass', 'supersaw'], lead: ['square', 'pluck'],
    snare: ['gated'], hat: ['closed'], perc: ['tom'], kick: 'punchy',
    bassPattern: ['pulse8', 'offbeat'], shapes: ['cold-open', 'build-drop'],
    impact: ['slam', 'boom'], whoosh: ['tonal', 'sweep'], tick: ['blip', 'click'], confirm: ['coin', 'pluck'], riser: ['tonal', 'reverse'],
    sevenths: [false], bpm: [100, 124],
  },
  breaks: {
    about: 'fast breakbeats, reese or FM bass',
    grooves: ['dnb', 'breaks', 'hyperpop'], modes: ['minor', 'dorian', 'phrygian'],
    bass: ['reese', 'fm'], chord: ['supersaw', 'glass', 'darkPad'], lead: ['pluck', 'square', 'bell'],
    snare: ['snare', 'clap'], hat: ['tight', 'closed'], perc: ['rim'], kick: 'tight',
    bassPattern: ['hold', 'syncop'], shapes: ['build-drop', 'stop-time', 'cold-open'],
    impact: ['slam', 'boom'], whoosh: ['sweep', 'tape'], tick: ['click', 'blip'], confirm: ['pluck', 'coin'], riser: ['noise', 'tonal'],
    sevenths: [false], bpm: [150, 176],
  },
  piano: {
    about: 'solo piano score, no drums',
    grooves: ['none'], modes: ['major', 'minor', 'lydian', 'dorian'],
    bass: ['piano'], chord: ['piano'], lead: ['piano'],
    snare: ['rim'], hat: ['shaker'], perc: ['woodblock'], kick: 'soft',
    bassPattern: ['two', 'root-fifth', 'hold'], shapes: ['pulse', 'swell', 'stop-time'],
    impact: ['thud', 'bloom'], whoosh: ['air', 'paper'], tick: ['key', 'tock'], confirm: ['chime', 'mallet'], riser: ['none'],
    sevenths: [true, false], bpm: [72, 132],
  },
  percussion: {
    about: 'stomps, claps, and hand percussion with a bass note; harmony only at the end',
    grooves: ['stomp', 'bounce', 'march', 'shuffle'], modes: ['minor', 'major', 'dorian', 'mixolydian'],
    bass: ['tom', 'round'], chord: ['organ', 'mallet'], lead: ['whistle', 'mallet'],
    snare: ['clap', 'snap'], hat: ['shaker'], perc: ['woodblock', 'conga', 'tom'], kick: 'stomp',
    bassPattern: ['two'], shapes: ['stomp'],
    impact: ['thud', 'timpani', 'stamp'], whoosh: ['air', 'paper'], tick: ['tock', 'pop'], confirm: ['mallet', 'coin'], riser: ['none'],
    sevenths: [false], bpm: [92, 128],
  },
  asmr: {
    about: 'no music: the product sounds carry the rhythm',
    grooves: ['none'], modes: ['major', 'lydian', 'dorian', 'minor'],
    bass: ['round'], chord: ['glass', 'mallet'], lead: ['mallet', 'musicbox', 'bell'],
    snare: ['rim'], hat: ['shaker'], perc: ['woodblock'], kick: 'soft',
    bassPattern: ['hold'], shapes: ['ui-only'],
    impact: ['thud', 'stamp', 'bloom'], whoosh: ['air', 'paper', 'tonal'], tick: ['key', 'tock', 'pop', 'drop', 'click'], confirm: ['chime', 'mallet', 'bell', 'coin'], riser: ['none'],
    sevenths: [true], bpm: [100, 130],
  },
};

export const FAMILY_IDS = Object.keys(FAMILIES);
export const SHAPES = {
  'build-drop': 'filtered build, a gap of near-silence, the drop where the story turns, a ringing final chord',
  'cold-open': 'the full groove from the first beat, one breakdown bar before the turn, then the groove returns with a top line',
  'stop-time': 'one stab per bar with silence around it until the turn, then the groove arrives',
  pulse: 'no drums: bass pulse and an arpeggio that doubles after the turn',
  swell: 'one long crescendo of layered chords and hits, no drop',
  stomp: 'percussion and bass only; harmony waits for the final chord',
  'ui-only': 'no music bed; sound design on the grid carries the rhythm',
};
const SUSTAINED = new Set(['supersaw', 'darkPad', 'strings', 'brass', 'organ', 'glass']);
const KICKS = {
  deep: { p0: [160, 200], p1: [57, 62], decay: [0.26, 0.34], click: [0.5, 0.8] },
  punchy: { p0: [140, 170], p1: [58, 63], decay: [0.2, 0.26], click: [0.6, 0.9] },
  tight: { p0: [165, 190], p1: [59, 64], decay: [0.15, 0.2], click: [0.7, 0.9] },
  soft: { p0: [105, 135], p1: [59, 66], decay: [0.14, 0.22], click: [0.15, 0.45] },
  chip: { p0: [280, 340], p1: [60, 66], decay: [0.08, 0.12], click: [0, 0.05], pitchTau: [0.018, 0.026] },
  stomp: { p0: [95, 110], p1: [58, 62], decay: [0.08, 0.12], click: [0.1, 0.2] },
};
// Kick pitch floors stay at 57 Hz or above: lower tails pile energy under 60 Hz, which phones
// cannot play and which eats loudness headroom.
const MOTIFS = [[1, 3, 5], [5, 3, 1], [1, 5, 8], [5, 6, 8], [3, 5, 6, 8], [8, 5, 6], [1, 2, 5], [5, 8, 10], [3, 2, 1, 5], [6, 5, 8]];
const MOTIF_STEPS = [[0, 2, 4], [0, 3, 6], [0, 1, 4], [0, 2, 3, 6], [0, 4, 6]];
const MELODY_STEPS = [[0, 3, 6, 11], [0, 4, 7, 10], [2, 6, 10, 14], [0, 6, 8, 14], [0, 3, 8, 11], [4, 6, 12, 14]];

// Level trims measured against the reference voices (supersaw pad, sub808, bell, clap, closed hat,
// boom, noise whoosh, click), so every kit sits at the same balance and arrangements can use one
// set of gains.
const TRIM = {
  chord: { supersaw: 0.42, darkPad: 0.45, strings: 0.44, brass: 0.36, organ: 0.7, glass: 0.85, keys: 0.9, piano: 0.8, pluck: 0.5, mallet: 0.62, pulse: 0.6 },
  bass: { sub808: 1, round: 1.5, pluckBass: 1.3, fm: 1.8, tri: 1.1, reese: 1, piano: 2.2, tom: 1 },
  lead: { bell: 1, pluck: 1, square: 0.7, musicbox: 1, whistle: 0.9, mallet: 1.2, pizz: 1.1, piano: 1.8 },
  snare: { clap: 1, snare: 0.9, brush: 1.2, rim: 0.7, snap: 1.8, noise: 0.8, gated: 0.65 },
  hat: { closed: 1, tight: 1.1, shaker: 0.6, chip: 1.2 },
  perc: { cowbell: 1, rim: 0.9, tom: 0.5, woodblock: 0.6, snap: 2.2, conga: 0.6 },
  impact: { boom: 1, slam: 0.95, thud: 1.05, timpani: 1.05, bloom: 1.5, stamp: 0.95 },
  whoosh: { sweep: 1, air: 0.65, tonal: 0.45, tape: 0.35, paper: 0.6 },
  tick: { click: 1, blip: 0.5, pop: 0.35, tock: 0.3, key: 1.6, drop: 0.35 },
  confirm: { bell: 1, chime: 1, mallet: 1.2, pluck: 1, coin: 0.7 },
  riser: { noise: 1, reverse: 1.2, tonal: 0.6, none: 0 },
};
const scaled = (buf, g) => {
  if (g === 1) return buf;
  for (const ch of Array.isArray(buf) ? buf : [buf]) for (let i = 0; i < ch.length; i += 1) ch[i] *= g;
  return buf;
};

// Fields the checker compares between videos.
export const SIGNATURE_FIELDS = ['family', 'groove', 'shape', 'key', 'mode', 'bass', 'chord', 'lead', 'snare', 'hat', 'bassPattern', 'impact', 'whoosh', 'tick', 'confirm'];
export const signatureOf = (spec = {}) => Object.fromEntries(SIGNATURE_FIELDS.map((f) => [f, spec[f] ?? spec.voices?.[f] ?? spec.sfx?.[f] ?? null]));
export function soundDistance(a, b) {
  const A = signatureOf(a);
  const B = signatureOf(b);
  return SIGNATURE_FIELDS.filter((f) => String(A[f]) !== String(B[f])).length;
}

// Small helpers ------------------------------------------------------------------------------------

const fadeTail = (buf, rel = 0.02) => {
  const r = Math.min(buf.length, secs(rel));
  for (let i = 0; i < r; i += 1) buf[buf.length - 1 - i] *= i / r;
  return buf;
};
const ramp = (buf, attack) => {
  const a = Math.min(buf.length, secs(attack));
  for (let i = 0; i < a; i += 1) buf[i] *= i / a;
  return buf;
};
const pan2 = (mono, pan = 0, gain = 1) => {
  const a = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  return [mono.map((v) => v * Math.cos(a) * gain), mono.map((v) => v * Math.sin(a) * gain)];
};
// Sum mono notes into a stereo pair, spread across the field and strummed by `strum` seconds.
function spread(len, notes, { strum = 0, width = 0.6, gain = 1 } = {}) {
  const n = secs(len + strum * notes.length);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  notes.forEach((buf, k) => {
    const pan = notes.length === 1 ? 0 : (k / (notes.length - 1)) * width - width / 2;
    const [l, r] = pan2(buf, pan, gain);
    mixInto(L, l, 1, secs(strum * k) - 1);
    mixInto(R, r, 1, secs(strum * k) - 1);
  });
  return [L, R];
}

// Voices -------------------------------------------------------------------------------------------
// Mono voices return a Float32Array. Peaks sit near 0.8 so placement gains decide the balance.

export const voice = {
  // Bass. Fundamentals between MIDI 36 and 47 need harmonics to be heard on a phone.
  roundBass(midi, len, { decay = 0.6 } = {}) {
    const n = secs(len);
    const f = noteHz(midi);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const t = i / SR;
      const e = t < 0.008 ? t / 0.008 : Math.exp(-(t - 0.008) / decay);
      out[i] = sat((Math.sin(TAU * f * t) + 0.45 * Math.sin(TAU * 2 * f * t) + 0.18 * Math.sin(TAU * 3 * f * t)) * e * 0.7, 1.6);
    }
    return fadeTail(out);
  },
  fmBass(midi, len, { ratio = 1, index = 3.2, decay = 0.28 } = {}) {
    const n = secs(len);
    const f = noteHz(midi);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const t = i / SR;
      const mod = Math.sin(TAU * f * ratio * t) * index * (0.15 + 0.85 * Math.exp(-t / 0.07));
      out[i] = Math.sin(TAU * f * t + mod) * (t < 0.003 ? t / 0.003 : Math.exp(-(t - 0.003) / decay));
    }
    return fadeTail(filter(out, 'lp', 2400));
  },
  reese(midi, len, { detune = 0.22, cutoff = 700 } = {}) {
    const n = secs(len);
    const f = noteHz(midi);
    const a = osc(n, f * 2 ** (detune / 12), 'saw');
    const b = osc(n, f * 2 ** (-detune / 12), 'saw', 0.37);
    const sub = osc(n, f);
    for (let i = 0; i < n; i += 1) a[i] = (a[i] + b[i]) * 0.5;
    const out = filter(a, 'lp', (t) => cutoff * (1 + 0.35 * Math.sin(TAU * 0.7 * t)), 1.2);
    for (let i = 0; i < n; i += 1) out[i] = sat(out[i] * 1.5 + sub[i] * 0.5, 1.8) * 0.8;
    return fadeTail(ramp(out, 0.01), 0.03);
  },
  pluckBass(midi, len, { decay = 0.2 } = {}) {
    const n = secs(len);
    const out = filter(osc(n, noteHz(midi), 'saw'), 'lp', (t) => 180 + 2200 * Math.exp(-t / 0.05), 1.6);
    mixInto(out, osc(n, noteHz(midi)), 0.6);
    return fadeTail(env(out, expDecay(decay, 0.003)));
  },
  triBass(midi, len) {
    const n = secs(len);
    const out = osc(n, noteHz(midi), 'tri');
    for (let i = 0; i < n; i += 1) out[i] = sat(out[i] * 1.1, 1.3) * 0.8;
    return fadeTail(ramp(out, 0.002), 0.012);
  },

  // Melodic.
  piano(midi, len = 1.8, { bright = 1 } = {}) {
    const n = secs(len);
    const f = noteHz(midi);
    const out = new Float32Array(n);
    const sustain = 1.9 * (130 / Math.max(65, f)) ** 0.45;
    for (let k = 1; k <= 9; k += 1) {
      const fk = f * k * Math.sqrt(1 + 0.0005 * k * k);
      if (fk > SR * 0.4) break;
      const g = k === 1 ? 1 : 0.62 / k ** (1.25 / bright);
      const tau = sustain / (1 + 0.42 * (k - 1));
      for (let i = 0; i < n; i += 1) {
        const t = i / SR;
        out[i] += g * Math.sin(TAU * fk * t + k * 0.7) * Math.exp(-t / tau);
      }
    }
    const hammer = filter(noise(secs(0.03)), 'bp', Math.min(4000, f * 6), 0.8);
    mixInto(out, env(hammer, expDecay(0.006, 0.0005)), 0.25);
    for (let i = 0; i < n; i += 1) out[i] *= 0.45;
    return fadeTail(ramp(out, 0.003), 0.03);
  },
  // Marimba (ratio near 3.9) through kalimba (ratio near 5.4, longer sustain).
  mallet(midi, len = 0.9, { ratio = 3.9, sustain = 0.32 } = {}) {
    const n = secs(len);
    const f = noteHz(midi);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const t = i / SR;
      out[i] = (Math.sin(TAU * f * t) * Math.exp(-t / sustain) + 0.35 * Math.sin(TAU * f * ratio * t) * Math.exp(-t / (sustain * 0.25))
        + 0.12 * Math.sin(TAU * f * ratio * 2.4 * t) * Math.exp(-t / (sustain * 0.1))) * 0.7;
    }
    const knock = filter(noise(secs(0.012)), 'bp', 1800, 1.2);
    mixInto(out, env(knock, expDecay(0.003, 0.0004)), 0.3);
    return fadeTail(ramp(out, 0.0015));
  },
  whistle(midi, len = 0.5) {
    const n = secs(len);
    const f = noteHz(midi);
    const out = osc(n, (t) => f * (1 + 0.006 * Math.sin(TAU * 5.5 * t) * clamp((t - 0.12) / 0.2, 0, 1)));
    const breath = filter(noise(n), 'bp', f, 6);
    for (let i = 0; i < n; i += 1) {
      const t = i / SR;
      out[i] = (out[i] * 0.6 + breath[i] * 0.18) * Math.min(1, t / 0.04) * Math.min(1, (len - t) / 0.08);
    }
    return out;
  },
  square(midi, len = 0.2) {
    const out = filter(osc(secs(len), noteHz(midi), 'square'), 'lp', 5200);
    for (let i = 0; i < out.length; i += 1) out[i] *= 0.45;
    return fadeTail(ramp(out, 0.002), 0.015);
  },
  pizz(midi, len = 0.35) {
    const n = secs(len);
    const out = filter(osc(n, noteHz(midi), 'saw'), 'lp', (t) => 400 + 3000 * Math.exp(-t / 0.02), 1.2);
    mixInto(out, filter(osc(n, noteHz(midi), 'tri'), 'bp', 260, 1.5), 0.6);
    return fadeTail(env(out, expDecay(0.09, 0.002)));
  },
  musicbox: (midi, len = 1.0) => inst.bell(noteHz(midi), len, { ratio: 1, index: 0.6, decay: 0.35 }),
  bell: (midi, len = 1.0) => inst.bell(noteHz(midi), len, { ratio: 3.5, index: 1.6, decay: 0.4 }),
  pluck: (midi, len = 0.3) => inst.pluck(midi, len),

  // Percussion.
  hat({ hp = 7200, bp = 10000, decay = 0.018, len = 0.07 } = {}) {
    const out = filter(filter(noise(secs(len)), 'hp', hp), 'bp', bp, 0.6);
    return env(out, expDecay(decay, 0.0008));
  },
  chipHat(open = false) {
    const n = secs(open ? 0.12 : 0.035);
    const src = noise(n);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) out[i] = src[i - (i % 6)] * 0.6;
    return env(out, expDecay(open ? 0.04 : 0.01, 0.0005));
  },
  shaker(len = 0.09) {
    const out = filter(noise(secs(len)), 'hp', 6000);
    return env(out, (t) => (t < 0.012 ? t / 0.012 : Math.exp(-(t - 0.012) / 0.03)) * 0.8);
  },
  rim() {
    const n = secs(0.06);
    const out = filter(noise(n), 'bp', 1800, 4);
    env(out, expDecay(0.012, 0.0003));
    return mixInto(out, env(osc(n, 430), expDecay(0.02, 0.0003)), 0.7);
  },
  snap() {
    const n = secs(0.09);
    const src = filter(noise(n), 'bp', 2200, 2.5);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const t = i / SR;
      out[i] = src[i] * Math.max(Math.exp(-t / 0.004), t >= 0.009 ? Math.exp(-(t - 0.009) / 0.02) : 0);
    }
    return out;
  },
  woodblock(f = 900) {
    const n = secs(0.09);
    const out = osc(n, f);
    mixInto(out, osc(n, f * 2.4), 0.3);
    return env(out, expDecay(0.025, 0.0004));
  },
  conga(midi = 62) {
    const n = secs(0.3);
    const f = noteHz(midi);
    const out = env(osc(n, (t) => f * (1 + 0.15 * Math.exp(-t / 0.01))), expDecay(0.12, 0.0006));
    return mixInto(out, env(filter(noise(secs(0.02)), 'bp', 1500, 1.2), expDecay(0.008, 0.0003)), 0.5);
  },
  tom(midi = 45, len = 0.5) {
    const n = secs(len);
    const f = noteHz(midi);
    const out = env(osc(n, (t) => f * (1 + 0.6 * Math.exp(-t / 0.03))), expDecay(0.18, 0.001));
    for (let i = 0; i < n; i += 1) out[i] = sat(out[i] * 1.3, 1.4);
    return out;
  },
  stomp() {
    const n = secs(0.35);
    const out = env(osc(n, (t) => 63 + 40 * Math.exp(-t / 0.03)), expDecay(0.09, 0.001));
    mixInto(out, env(filter(noise(n, true), 'lp', 420), expDecay(0.05, 0.001)), 1.4);
    for (let i = 0; i < n; i += 1) out[i] = sat(out[i] * 1.4, 1.5);
    return out;
  },
  noiseSnare(len = 0.14) {
    const n = secs(len);
    const src = noise(n);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) out[i] = src[i - (i % 5)] * 0.7;
    return env(out, expDecay(0.05, 0.0005));
  },
  gatedSnare() {
    const n = secs(0.34);
    const out = inst.snare(0.34);
    const tail = filter(noise(n), 'bp', 1800, 0.6);
    for (let i = 0; i < n; i += 1) {
      const t = i / SR;
      out[i] += tail[i] * 0.45 * (t < 0.2 ? 1 : Math.max(0, 1 - (t - 0.2) / 0.012));
    }
    return out;
  },
  brush() {
    const n = secs(0.22);
    return env(filter(noise(n), 'bp', 3000, 0.5), (t) => (t < 0.03 ? t / 0.03 : Math.exp(-(t - 0.03) / 0.09)) * 0.6);
  },

  // Sound design.
  thud() {
    const n = secs(0.5);
    const out = env(osc(n, (t) => 62 + 34 * Math.exp(-t / 0.035)), expDecay(0.11, 0.002));
    mixInto(out, env(filter(noise(secs(0.05)), 'lp', 900), expDecay(0.012, 0.0005)), 0.7);
    for (let i = 0; i < n; i += 1) out[i] = sat(out[i] * 1.6, 1.5);
    return out;
  },
  slam(len = 1.1) {
    const n = secs(len);
    const out = env(osc(n, (t) => 60 + 70 * Math.exp(-t / 0.06)), expDecay(0.3, 0.002));
    const body = filter(noise(n), 'bp', (t) => 300 + 1900 * Math.exp(-t / 0.05), 0.7);
    mixInto(out, env(body, expDecay(0.09, 0.0005)), 1.1);
    for (let i = 0; i < n; i += 1) out[i] = sat(out[i] * 1.7, 1.7);
    return out;
  },
  timpani(midi = 43, len = 1.6) {
    const n = secs(len);
    const f = noteHz(midi);
    const out = new Float32Array(n);
    for (const [ratio, g, tau] of [[1, 1, 0.55], [1.5, 0.5, 0.35], [1.99, 0.3, 0.25], [2.44, 0.14, 0.15]]) {
      for (let i = 0; i < n; i += 1) {
        const t = i / SR;
        out[i] += g * Math.sin(TAU * f * ratio * (t + 0.004 * Math.exp(-t / 0.02))) * Math.exp(-t / tau);
      }
    }
    mixInto(out, env(filter(noise(secs(0.04)), 'lp', 1200), expDecay(0.01, 0.0005)), 0.5);
    for (let i = 0; i < n; i += 1) out[i] = sat(out[i] * 0.8, 1.3);
    return fadeTail(ramp(out, 0.002), 0.05);
  },
  bloom(len = 1.2, f = 110) {
    const n = secs(len);
    const out = osc(n, f);
    mixInto(out, osc(n, f * 2), 0.4);
    const air = filter(noise(n, true), 'bp', 900, 0.5);
    for (let i = 0; i < n; i += 1) {
      const x = i / n;
      out[i] = (out[i] * 0.55 + air[i] * 0.5) * (x < 0.18 ? (x / 0.18) ** 1.5 : (1 - (x - 0.18) / 0.82) ** 2);
    }
    return out;
  },
  stamp() {
    const n = secs(0.3);
    const out = env(filter(filter(noise(n, true), 'lp', 320), 'hp', 75), expDecay(0.045, 0.001));
    for (let i = 0; i < n; i += 1) out[i] = sat(out[i] * 3, 1.5);
    return mixInto(out, env(filter(noise(secs(0.02)), 'hp', 3200), expDecay(0.004, 0.0003)), 0.5);
  },
  air(len) {
    const n = secs(len);
    const out = filter(noise(n), 'hp', 2400);
    return env(filter(out, 'lp', 9000), (t) => Math.sin(Math.PI * clamp(t / len, 0, 1)) ** 2 * 0.6);
  },
  tonalSweep(len, f0, f1) {
    const n = secs(len);
    const out = osc(n, (t) => f0 * (f1 / f0) ** clamp(t / len, 0, 1));
    const nz = filter(noise(n, true), 'bp', (t) => 2 * f0 * (f1 / f0) ** clamp(t / len, 0, 1), 2);
    for (let i = 0; i < n; i += 1) out[i] = (out[i] * 0.35 + nz[i] * 0.9) * Math.sin(Math.PI * (i / n)) ** 1.5;
    return out;
  },
  tape(len) {
    const n = secs(len);
    const out = filter(osc(n, (t) => 620 * (0.2 + 0.8 * (1 - clamp(t / len, 0, 1)) ** 2), 'saw'), 'lp', 2400);
    return env(out, (t) => Math.sin(Math.PI * clamp(t / len, 0, 1)) ** 0.7 * 0.5);
  },
  pop(f = 900) {
    const n = secs(0.07);
    return env(osc(n, (t) => f * (1 + 1.2 * t / 0.07)), expDecay(0.018, 0.001));
  },
  tock(f = 1100) {
    const n = secs(0.06);
    const out = osc(n, f);
    mixInto(out, osc(n, f * 2.7), 0.25);
    return env(out, expDecay(0.014, 0.0004));
  },
  key() {
    const n = secs(0.07);
    const out = new Float32Array(n);
    mixInto(out, env(filter(noise(secs(0.012)), 'bp', 3800, 2), expDecay(0.003, 0.0003)), 0.9);
    mixInto(out, env(filter(noise(secs(0.02)), 'bp', 1500, 2), expDecay(0.006, 0.0003)), 0.6, secs(0.028));
    return out;
  },
  drop(f = 1300) {
    const n = secs(0.12);
    return env(osc(n, (t) => f * (0.55 + 0.9 * clamp(t / 0.05, 0, 1))), (t) => (t < 0.002 ? t / 0.002 : Math.exp(-(t - 0.002) / 0.03)));
  },
  reverseCrash(len) {
    const out = inst.crash(len);
    out.reverse();
    return fadeTail(out, 0.01);
  },
};

// Chords. Each returns [L, R]. `open` (0 to 1, number or function of seconds) closes a low-pass
// over the whole chord, so a build can open up whatever the instrument is. Bright pads sit an
// octave above the written voicing.
const up = (midis) => midis.map((m) => m + 12);
const chordVoices = {
  supersaw: (m, len, p) => inst.supersaw(up(m), len, { cutoff: 3600, q: 0.9, attack: 0.03, release: 0.1, detune: p.detune }),
  darkPad: (m, len, p) => inst.supersaw(m, len, { cutoff: 900, q: 0.8, voices: 7, attack: 0.12, release: 0.2, detune: p.detune * 1.6 }),
  strings: (m, len, p) => inst.supersaw(up(m), len, { cutoff: (t) => 1500 + 1100 * Math.min(1, t / 0.6), q: 0.7, attack: 0.22, release: 0.3, detune: p.detune * 1.2 }),
  brass: (m, len, p) => inst.supersaw(up(m), len, { cutoff: (t) => 500 + 3400 * (1 - Math.exp(-t / 0.05)) * (0.45 + 0.55 * Math.exp(-t / 1.2)), q: 1.1, voices: 3, attack: 0.012, release: 0.12, detune: p.detune * 0.6 }),
  keys: (m, len) => inst.keys(m, len),
  piano: (m, len, p) => spread(len, m.map((x) => voice.piano(x, len, { bright: p.bright })), { strum: 0.008, gain: 0.8 }),
  mallet: (m, len, p) => spread(len, m.map((x) => voice.mallet(x + 12, Math.min(len, 1.2), { ratio: p.malletRatio, sustain: p.malletSustain })), { strum: 0.016, gain: 0.7 }),
  pluck: (m, len) => spread(len, m.map((x) => inst.pluck(x + 12, Math.min(len, 0.5))), { strum: 0.012, gain: 0.7 }),
  pulse: (m, len) => spread(len, m.map((x) => voice.square(x + 12, Math.min(len, 0.28))), { gain: 0.5 }),
  organ(m, len, p) {
    const n = secs(len);
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    const bars = [[1, 1], [2, 0.55], [3, 0.3], [4, 0.22], [6, 0.1]];
    m.forEach((midi, j) => {
      const f = noteHz(midi);
      for (const [h, g] of bars) {
        const wl = TAU * f * h * (1 - 0.0012);
        const wr = TAU * f * h * (1 + 0.0012);
        for (let i = 0; i < n; i += 1) {
          const t = i / SR;
          const trem = 1 + 0.07 * Math.sin(TAU * p.tremolo * t + j);
          L[i] += g * Math.sin(wl * t) * trem;
          R[i] += g * Math.sin(wr * t + 0.4) * trem;
        }
      }
    });
    const scale = 0.24 / Math.sqrt(m.length);
    for (let i = 0; i < n; i += 1) {
      const t = i / SR;
      const e = Math.min(1, t / 0.006) * Math.min(1, (len - t) / 0.06) * scale;
      L[i] *= e;
      R[i] *= e;
    }
    return [L, R];
  },
  glass(m, len, p) {
    return spread(len, m.map((x) => {
      const b = inst.bell(noteHz(x + 12), len, { ratio: p.glassRatio, index: 1.3, decay: len * 0.6 });
      const shimmer = osc(b.length, noteHz(x + 24));
      for (let i = 0; i < b.length; i += 1) b[i] = (b[i] + shimmer[i] * 0.16 * Math.sin(Math.PI * (i / b.length))) * 0.5;
      return fadeTail(ramp(b, 0.06), 0.1);
    }), { gain: 0.7 });
  },
};

// Kit ----------------------------------------------------------------------------------------------

export function designKit(input = {}) {
  const seed = (Number(input.seed ?? 1) >>> 0) || 1;
  const r = rngFrom(seed);
  const pick = (list) => list[Math.floor(r() * list.length)];
  const range = ([a, b]) => a + (b - a) * r();
  // Draw every choice in a fixed order so one seed always means one kit, then let explicit fields win.
  const flat = { ...(input.voices ?? {}), ...(input.sfx ?? {}), ...input };
  const drawnFamily = pick(FAMILY_IDS.filter((f) => f !== 'asmr'));
  const family = FAMILIES[flat.family] ? flat.family : drawnFamily;
  const F = FAMILIES[family];
  const choose = (field, list) => {
    const drawn = pick(list);
    return flat[field] ?? drawn;
  };
  const groove = choose('groove', F.grooves);
  const shape = choose('shape', F.shapes);
  const mode = choose('mode', F.modes);
  let key = Math.floor(r() * 12);
  if (Number.isInteger(flat.key)) key = ((flat.key % 12) + 12) % 12;
  else if (NOTE_NAMES.includes(String(flat.key ?? '').toUpperCase())) key = NOTE_NAMES.indexOf(String(flat.key).toUpperCase());
  const drawnPath = pick(PATHS[mode] ?? PATHS.minor);
  const path = Array.isArray(flat.path) && flat.path.length ? flat.path : drawnPath;
  const sevenths = choose('sevenths', F.sevenths);
  // The sonic logo is a contour (scale degrees) and a rhythm (sixteenth steps). A brand may give
  // just the degrees.
  const drawnMotif = { degrees: pick(MOTIFS), steps: pick(MOTIF_STEPS) };
  const givenMotif = Array.isArray(flat.motif) ? { degrees: flat.motif } : flat.motif;
  const motif = givenMotif?.degrees?.length
    ? { degrees: givenMotif.degrees, steps: givenMotif.steps?.length ? givenMotif.steps : givenMotif.degrees.map((_, i) => i * 2) }
    : drawnMotif;
  const spec = {
    seed, family, groove, shape, key, keyName: NOTE_NAMES[key], mode, path, sevenths,
    bass: choose('bass', F.bass), chord: choose('chord', F.chord), lead: choose('lead', F.lead),
    snare: choose('snare', F.snare), hat: choose('hat', F.hat), perc: choose('perc', F.perc),
    bassPattern: choose('bassPattern', F.bassPattern),
    impact: choose('impact', F.impact), whoosh: choose('whoosh', F.whoosh), tick: choose('tick', F.tick),
    confirm: choose('confirm', F.confirm), riser: choose('riser', F.riser),
    arp: choose('arp', ['up', 'down', 'updown', 'skip']),
    melody: choose('melody', MELODY_STEPS),
    restrike: choose('restrike', [6, 10, 7, 11]),
    motif,
    bed: flat.bed ?? F.bed ?? null,
    bpm: F.bpm,
  };
  // Timbre: continuous parameters, drawn after the choices so adding options never reshuffles them.
  const K = KICKS[F.kick];
  const tone = {
    kick: { p0: range(K.p0), p1: range(K.p1), decay: range(K.decay), click: range(K.click), ...(K.pitchTau ? { pitchTau: range(K.pitchTau) } : {}) },
    hatHp: range([6400, 9200]), hatDecay: range([0.012, 0.024]), snareLen: range([0.14, 0.24]),
    detune: range([0.08, 0.2]), bright: range([0.8, 1.3]), tremolo: range([4.5, 6.5]), glassRatio: pick([2, 2.01, 3.5, 4]),
    malletRatio: range([3.7, 5.6]), malletSustain: range([0.26, 0.6]),
    bassDrive: range([2.1, 2.8]), bassDecay: range([0.9, 1.6]), fmIndex: range([2.2, 4.2]), fmRatio: pick([1, 1, 2]), reeseCutoff: range([550, 950]),
    boomFrom: range([88, 130]), boomTau: range([0.2, 0.32]), sweepLo: range([280, 620]), sweepHi: range([3400, 7200]), sweepQ: range([0.9, 1.6]),
    tickF: range([2400, 4200]), popF: range([700, 1300]), tockF: range([850, 1500]),
    swing: GROOVES[groove]?.swing ?? 0, room: range([0.2, 0.5]),
  };
  const scale = (degree, base = 60) => scaleMidi(key, mode, degree, base);
  const chords = path.map((d) => chordOn(key, mode, d, sevenths));
  const roots = chords.map((c) => fold(c[0], 36, 47));
  const tonic = chordOn(key, mode, 1, sevenths);

  const bassVoice = (m, len, soft) => {
    if (spec.bass === 'sub808') return inst.sub808(m, len, { drive: soft ? 2.1 : tone.bassDrive, decay: soft ? tone.bassDecay * 0.8 : tone.bassDecay });
    if (spec.bass === 'fm') return voice.fmBass(m, len, { ratio: tone.fmRatio, index: soft ? tone.fmIndex * 0.6 : tone.fmIndex });
    if (spec.bass === 'reese') return voice.reese(m, len, { detune: tone.detune + 0.08, cutoff: soft ? tone.reeseCutoff * 0.6 : tone.reeseCutoff });
    if (spec.bass === 'pluckBass') return voice.pluckBass(m, len);
    if (spec.bass === 'tri') return voice.triBass(m, len);
    if (spec.bass === 'piano') return voice.piano(m, Math.max(len, 0.8), { bright: tone.bright });
    if (spec.bass === 'tom') return voice.tom(m, Math.min(len, 0.5));
    return voice.roundBass(m, len);
  };
  // Any pitch is folded into MIDI 36 to 47, where a phone still hears the harmonics.
  const bass = (midi, len, { soft = false } = {}) => scaled(bassVoice(fold(midi, 36, 47), len, soft), TRIM.bass[spec.bass] ?? 1);

  const chord = (midis, len, { open = 1 } = {}) => {
    const out = scaled((chordVoices[spec.chord] ?? chordVoices.keys)(midis, len, tone), TRIM.chord[spec.chord] ?? 1);
    if (open === 1) return out;
    const at = typeof open === 'function' ? open : () => open;
    return out.map((ch) => filter(ch, 'lp', (t) => 350 * 50 ** clamp(at(t), 0, 1), 0.8));
  };

  const leadVoice = (midi, len) => {
    if (spec.lead === 'mallet') return voice.mallet(midi, Math.max(len, 0.5), { ratio: tone.malletRatio, sustain: tone.malletSustain });
    if (spec.lead === 'piano') return voice.piano(midi, Math.max(len, 0.9), { bright: tone.bright });
    return (voice[spec.lead] ?? voice.bell)(midi, len);
  };
  const lead = (midi, len = 0.4) => scaled(leadVoice(midi, len), TRIM.lead[spec.lead] ?? 1);

  const drum = {
    kickOpts: tone.kick,
    snare: () => scaled(({ clap: inst.clap, snare: () => inst.snare(tone.snareLen), brush: voice.brush, rim: voice.rim, snap: voice.snap, noise: voice.noiseSnare, gated: voice.gatedSnare }[spec.snare] ?? inst.clap)(), TRIM.snare[spec.snare] ?? 1),
    hat: (open = false) => {
      const g = TRIM.hat[spec.hat] ?? 1;
      if (spec.hat === 'shaker') return scaled(voice.shaker(open ? 0.16 : 0.09), g);
      if (spec.hat === 'chip') return scaled(voice.chipHat(open), g);
      if (open) return inst.hat(true);
      return scaled(voice.hat({ hp: spec.hat === 'tight' ? tone.hatHp * 1.2 : tone.hatHp, bp: spec.hat === 'tight' ? 12000 : 10000, decay: spec.hat === 'tight' ? tone.hatDecay * 0.6 : tone.hatDecay }), g);
    },
    perc: (i = 0) => {
      const g = TRIM.perc[spec.perc] ?? 1;
      if (spec.perc === 'cowbell') return inst.cowbell();
      if (spec.perc === 'conga') return scaled(voice.conga(scale(i % 2 ? 5 : 1, 60)), g);
      if (spec.perc === 'tom') return scaled(voice.tom(fold(scale(i % 2 ? 5 : 1, 48), 43, 55), 0.3), g);
      if (spec.perc === 'woodblock') return scaled(voice.woodblock(tone.tockF * (i % 2 ? 1.25 : 1)), g);
      if (spec.perc === 'snap') return scaled(voice.snap(), g);
      return scaled(voice.rim(), g);
    },
  };

  // A kick (or stomp) that also drives the sidechain duck.
  function kick(mix, time, gain = 1) {
    if (F.kick === 'stomp') {
      mix.kicks.push(time);
      mix.place(voice.stomp(), time, { gain, stem: 'music' });
    } else {
      mix.kick(time, tone.kick, gain);
    }
  }

  // One bar of this kit's groove. Pass { kicks: false } when kicks come from the shared KICKS list.
  function groovePlay(mix, grid, bar, { level = 1, kicks = true, name = groove, thin = false } = {}) {
    const g = GROOVES[name] ?? GROOVES.none;
    const at = (s) => stepTime(grid, bar, s, g.swing ?? 0);
    if (kicks) for (const s of g.kick ?? []) kick(mix, at(s), level);
    for (const s of g.hat ?? []) {
      if (thin && s % 4 !== 0 && s % 4 !== 2) continue;
      mix.place(drum.hat(false), at(s), { gain: (s % 4 === 0 ? 0.22 : 0.14) * level, pan: 0.25, stem: 'music' });
    }
    if (thin) return;
    for (const s of g.open ?? []) mix.place(drum.hat(true), at(s), { gain: 0.11 * level, pan: 0.3, stem: 'music' });
    for (const s of g.clap ?? []) mix.place(spec.snare === 'snare' || spec.snare === 'clap' ? inst.clap() : drum.snare(), at(s), { gain: 0.6 * level, send: 0.35, stem: 'music' });
    for (const s of g.snare ?? []) mix.place(drum.snare(), at(s), { gain: 0.55 * level, send: 0.3, stem: 'music' });
    for (const s of g.ghost ?? []) mix.place(drum.snare(), at(s), { gain: 0.16 * level, send: 0.2, stem: 'music' });
    (g.perc ?? []).forEach((s, i) => mix.place(drum.perc(i), at(s), { gain: 0.2 * level, pan: -0.2, send: 0.2, stem: 'music' }));
    if (g.roll) for (let i = 0; i < g.roll.n; i += 1) mix.place(drum.hat(false), grid.step(bar, g.roll.at + (i * g.roll.span) / g.roll.n), { gain: (0.08 + i * 0.02) * level, pan: 0.35, stem: 'music' });
  }

  // Sound design in this kit's voice. Each helper places its own buffers on the sfx stem.
  const sfx = {
    impact(mix, time, { size = 1, gain = 1, send = 0.25 } = {}) {
      const buf = {
        boom: () => inst.boom(1 + 0.9 * size, { from: tone.boomFrom, tau: tone.boomTau }),
        slam: () => voice.slam(0.7 + 0.5 * size),
        thud: () => voice.thud(),
        timpani: () => voice.timpani(fold(scale(1, 36), 38, 47), 1 + 0.8 * size),
        bloom: () => voice.bloom(0.9 + 0.6 * size, noteHz(fold(scale(1, 36), 43, 54))),
        stamp: () => voice.stamp(),
      }[spec.impact]();
      // Soft impacts start before the hit so their peak lands on it.
      mix.place(buf, spec.impact === 'bloom' ? time - (0.9 + 0.6 * size) * 0.18 : time, { gain: 0.85 * gain * (0.6 + 0.4 * size) * TRIM.impact[spec.impact], send });
    },
    // A move that lands at `land`. dir 'out' reverses the sweep for exits.
    whoosh(mix, land, { len = 0.6, gain = 0.4, pan = 0, dir = 'in', send = 0.1 } = {}) {
      const [a, b] = dir === 'in' ? [tone.sweepLo, tone.sweepHi] : [tone.sweepHi, tone.sweepLo];
      const buf = {
        sweep: () => inst.whoosh(len, { f0: a, f1: b, q: tone.sweepQ }),
        air: () => voice.air(len),
        tonal: () => (dir === 'in' ? voice.tonalSweep(len, noteHz(scale(1, 48)), noteHz(scale(5, 60))) : voice.tonalSweep(len, noteHz(scale(5, 60)), noteHz(scale(1, 48)))),
        tape: () => voice.tape(len),
        paper: () => inst.swish(len),
      }[spec.whoosh]();
      mix.place(buf, land - len * (spec.whoosh === 'tape' ? 0.5 : 0.75), { gain: gain * TRIM.whoosh[spec.whoosh], pan, send });
    },
    tick(mix, time, { i = 0, gain = 0.2, pan = 0 } = {}) {
      const up = i % 2 ? 1.18 : 1;
      const buf = {
        click: () => inst.tick({ f: tone.tickF * up }),
        blip: () => inst.blip(noteHz(scale(1 + (i % 3) * 2, 72)), 0.09),
        pop: () => voice.pop(tone.popF * up),
        tock: () => voice.tock(tone.tockF * up),
        key: () => voice.key(),
        drop: () => voice.drop(tone.popF * 1.4 * up),
      }[spec.tick]();
      mix.place(buf, time, { gain: gain * TRIM.tick[spec.tick], pan });
    },
    // A short rising figure for confirmations and reveals, in key.
    confirm(mix, time, { gain = 0.1, notes = 3, step = 0.045, octave = 0, send = 0.4 } = {}) {
      const degrees = [1, 3, 5, 8].slice(0, spec.confirm === 'coin' ? 2 : notes);
      degrees.forEach((d, j) => {
        const m = scale(spec.confirm === 'coin' ? [5, 8][j] : d, 72 + 12 * octave);
        const buf = {
          bell: () => inst.bell(noteHz(m), 0.9, { ratio: 2, index: 1.1, decay: 0.3 }),
          chime: () => inst.bell(noteHz(m + 12), 1.1, { ratio: tone.glassRatio, index: 0.9, decay: 0.45 }),
          mallet: () => voice.mallet(m, 0.6, { ratio: tone.malletRatio, sustain: tone.malletSustain }),
          pluck: () => inst.pluck(m, 0.3),
          coin: () => voice.square(m + 12, j === 0 ? 0.07 : 0.22),
        }[spec.confirm]();
        mix.place(buf, time + j * (spec.confirm === 'coin' ? 0.07 : step), { gain: gain * TRIM.confirm[spec.confirm], pan: -0.2 + j * 0.2, send });
      });
    },
    // Tension into a moment: ends at `start + len`. Some kits use silence instead.
    riser(mix, start, len, { gain = 0.22 } = {}) {
      if (spec.riser === 'none') return;
      const buf = {
        noise: () => inst.riser(len),
        reverse: () => voice.reverseCrash(Math.min(len, 2.4)),
        tonal: () => voice.tonalSweep(len, noteHz(scale(1, 48)), noteHz(scale(1, 72))),
      }[spec.riser]();
      mix.place(buf, spec.riser === 'reverse' ? start + len - Math.min(len, 2.4) : start, { gain: gain * TRIM.riser[spec.riser], send: 0.2, stem: 'music' });
    },
  };

  // The app's sonic logo: the same contour in every video, in this video's key and lead voice.
  function playMotif(mix, time, { step = 0.125, gain = 0.14, octave = 1, send = 0.45 } = {}) {
    const { degrees, steps } = spec.motif;
    degrees.forEach((d, j) => {
      const at = time + (steps[j] ?? j * 2) * step;
      mix.place(lead(scale(d, 60 + 12 * octave), 0.9), at, { gain, pan: -0.15 + 0.1 * j, send, stem: 'music' });
    });
    return time + (steps[degrees.length - 1] ?? degrees.length * 2) * step;
  }

  return {
    spec, tone, family: F, sustained: SUSTAINED.has(spec.chord), chords, roots, tonic, scale,
    bass, chord, lead, drum, kick, groove: groovePlay, sfx, playMotif,
    signature: signatureOf(spec),
  };
}

// Lines for a script's Sound section and for `studio sound`.
export function describeKit(spec) {
  const F = FAMILIES[spec.family] ?? {};
  return [
    `family ${spec.family} (${F.about ?? ''})`,
    `key ${spec.keyName ?? NOTE_NAMES[spec.key]} ${spec.mode}, chords on degrees ${spec.path.join(' ')}${spec.sevenths ? ' with sevenths' : ''}`,
    `groove ${spec.groove}, shape ${spec.shape}: ${SHAPES[spec.shape] ?? ''}`,
    `voices: bass ${spec.bass} (${spec.bassPattern}), chords ${spec.chord}, lead ${spec.lead}, snare ${spec.snare}, hats ${spec.hat}, perc ${spec.perc}`,
    `sound design: impact ${spec.impact}, moves ${spec.whoosh}, ticks ${spec.tick}, confirm ${spec.confirm}, riser ${spec.riser}`,
    `sonic logo: degrees ${spec.motif.degrees.join(' ')} on steps ${spec.motif.steps.join(' ')}`,
    `tempo range ${F.bpm ? F.bpm.join(' to ') : '?'} BPM`,
  ];
}
