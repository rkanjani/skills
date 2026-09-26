// Beat map shared by picture and sound. 128 BPM, 21 bars = 39.375 s. Every act changes on a bar
// line and gets the bars its copy needs to be read on the first watch: the hook and the ask get 2,
// the league scan 4, the answer, the flip, and the end card 3, the montage and the climb 2.
import { b, BAR, BEAT } from './core.mjs';

export const CUE = {
  // Bars 1-2: hook
  hook: 0,
  recordSlam: b(1),
  tilesIn: b(2),
  swing: b(4),
  hookOut: b(7),

  // Bars 3-4: the ask
  ask: b(8),
  typeStart: b(8.75),
  typeEnd: b(12),
  send: b(13),
  thinking: b(14),

  // Bars 5-8: the league scan, one filter per bar
  scan: b(16),
  filter1: b(20),
  filter2: b(24),
  filter3: b(28),

  // Bars 9-11: the answer
  answer: b(32),
  answerText: b(33),
  alternates: b(36),
  add: b(39),
  suck: b(43),

  // Bars 12-14: the drop and the flip
  drop: b(44),
  flipAst: b(45),
  flipStl: b(46.5),
  upSlam: b(48),
  flipOut: b(54.5),

  // Bars 15-16: stream, sit, trade, just ask
  stream: b(56),
  sit: b(58),
  trade: b(60),
  justAsk: b(62),

  // Bars 17-18: standings climb
  climb: b(64),
  rank5: b(65),
  rank3: b(66),
  rank2: b(67),
  rank1: b(68),

  // Bars 19-21: end card
  logo: b(72),
  tagline: b(74),
  cta: b(76),
  end: b(84),
};

// Kick drum hits, shared with the soundtrack so the court can pulse with the beat.
const step = (bar, s) => bar * BAR + (s * BEAT) / 4;
const pattern = (bars, steps) => bars.flatMap((k) => steps.map((s) => step(k, s)));
export const KICKS = [
  b(1),
  ...pattern([2, 3], [0, 10]),
  ...pattern([4, 5, 6, 7, 8, 9, 10], [0, 6, 10]),
  ...pattern([11, 12, 13], [0, 6, 11]),
  ...pattern([14, 15], [0, 4, 8, 12]),
  ...pattern([16, 17], [0, 6, 11]),
  b(72),
];
