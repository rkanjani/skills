// Procedural score and sound design toolkit (Node). A video's soundtrack.mjs creates a mix,
// places instruments on the shared beat grid, and renders a full mix plus a music-free SFX stem.
//
//   const mix = createMix({ duration: grid.duration });
//   mix.drums(grid, 4, 'trap');                 // one bar of a genre pattern
//   mix.place(inst.whoosh(0.3), cue.whip - 0.2, { gain: 0.4, pan: -0.3 });
//   mix.render('out/soundtrack.wav');           // also writes out/soundtrack-sfx.wav

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const SR = 48000;
const TAU = Math.PI * 2;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const dbToGain = (db) => 10 ** (db / 20);
export const noteHz = (midi) => 440 * 2 ** ((midi - 69) / 12);
export const secs = (d) => Math.max(1, Math.round(d * SR));

let seed = 1337;
export const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
export const rnd = (a, b) => a + (b - a) * rand();

// DSP primitives ---------------------------------------------------------------------------------

function polyblep(t, dt) {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

export class Biquad {
  constructor(type = 'lp', f = 1000, q = 0.707, gainDb = 0) {
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
    this.set(type, f, q, gainDb);
  }

  set(type, f, q, gainDb = 0) {
    const w0 = (TAU * clamp(f, 10, SR * 0.45)) / SR;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    if (type === 'hs' || type === 'ls') {
      const A = 10 ** (gainDb / 40);
      const sq = 2 * Math.sqrt(A) * (Math.sin(w0) / 2) * Math.SQRT2;
      const sign = type === 'hs' ? 1 : -1;
      const a0 = A + 1 - sign * (A - 1) * cos + sq;
      this.b0 = (A * (A + 1 + sign * (A - 1) * cos + sq)) / a0;
      this.b1 = (-2 * sign * A * (A - 1 + sign * (A + 1) * cos)) / a0;
      this.b2 = (A * (A + 1 + sign * (A - 1) * cos - sq)) / a0;
      this.a1 = (2 * sign * (A - 1 - sign * (A + 1) * cos)) / a0;
      this.a2 = (A + 1 - sign * (A - 1) * cos - sq) / a0;
      return;
    }
    let b0;
    let b1;
    let b2;
    if (type === 'lp') {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
    } else if (type === 'hp') {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    const a0 = 1 + alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

// Filter a buffer; cutoff may be a function of seconds, updated every 16 samples.
export function filter(buf, type, cutoff, q = 0.707) {
  const f = new Biquad(type, typeof cutoff === 'function' ? cutoff(0) : cutoff, q);
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i += 1) {
    if (typeof cutoff === 'function' && i % 16 === 0) f.set(type, cutoff(i / SR), q);
    out[i] = f.run(buf[i]);
  }
  return out;
}

export function noise(len, pink = false) {
  const out = new Float32Array(len);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < len; i += 1) {
    const w = rand() * 2 - 1;
    if (pink) {
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    } else {
      out[i] = w;
    }
  }
  return out;
}

export const env = (buf, fn) => {
  for (let i = 0; i < buf.length; i += 1) buf[i] *= fn(i / SR);
  return buf;
};
export const expDecay = (tau, attack = 0.002) => (t) => (t < attack ? t / attack : Math.exp(-(t - attack) / tau));
export const sat = (x, drive = 1) => Math.tanh(x * drive) / Math.tanh(drive);

export function osc(len, freq, shape = 'sine', phase0 = 0) {
  const out = new Float32Array(len);
  let ph = phase0;
  for (let i = 0; i < len; i += 1) {
    const f = typeof freq === 'function' ? freq(i / SR) : freq;
    const dt = f / SR;
    let v;
    if (shape === 'sine') v = Math.sin(TAU * ph);
    else if (shape === 'saw') v = 2 * ph - 1 - polyblep(ph, dt);
    else if (shape === 'square') v = (ph < 0.5 ? 1 : -1) + polyblep(ph, dt) - polyblep((ph + 0.5) % 1, dt);
    else v = 1 - 4 * Math.abs(ph - 0.5);
    out[i] = v;
    ph += dt;
    ph -= Math.floor(ph);
  }
  return out;
}

export function mixInto(target, src, gain = 1, offset = 0) {
  for (let i = 0; i < src.length && i + offset < target.length; i += 1) target[i + offset] += src[i] * gain;
  return target;
}

// Instruments ----------------------------------------------------------------------------------
// Mono instruments return a Float32Array; chordal ones return [left, right].

export const inst = {
  kick({ p0 = 170, p1 = 54, pitchTau = 0.04, decay = 0.26, click = 0.7, len = 0.5 } = {}) {
    const n = secs(len);
    const body = osc(n, (t) => p1 + (p0 - p1) * Math.exp(-t / pitchTau));
    env(body, (t) => (t < 0.003 ? t / 0.003 : Math.exp(-(t - 0.003) / decay)));
    for (let i = 0; i < n; i += 1) body[i] = sat(body[i] * 1.6, 1.4);
    const c = filter(noise(secs(0.012)), 'hp', 1800);
    env(c, expDecay(0.003, 0.0005));
    return mixInto(body, c, click);
  },

  // Tuned 808. MIDI 36-43 keeps the fundamental audible on phones; saturation adds harmonics.
  sub808(midi, len, { glideFrom = null, glideTau = 0.06, drive = 2.2, decay = 1.4 } = {}) {
    const n = secs(len);
    const f1 = noteHz(midi);
    const f0 = glideFrom === null ? f1 : noteHz(glideFrom);
    const out = osc(n, (t) => f1 + (f0 - f1) * Math.exp(-t / glideTau));
    env(out, (t) => (t < 0.004 ? t / 0.004 : Math.exp(-(t - 0.004) / decay)) * (t > len - 0.03 ? (len - t) / 0.03 : 1));
    for (let i = 0; i < n; i += 1) out[i] = sat(out[i], drive);
    return filter(out, 'lp', 1600);
  },

  clap() {
    const n = secs(0.45);
    const src = filter(filter(noise(n), 'bp', 1400, 0.9), 'hp', 700);
    const out = new Float32Array(n);
    const hits = [0, 0.011, 0.022, 0.034];
    for (let i = 0; i < n; i += 1) {
      const t = i / SR;
      let e = 0;
      for (const h of hits) if (t >= h) e = Math.max(e, Math.exp(-(t - h) / (h === 0.034 ? 0.14 : 0.008)));
      out[i] = src[i] * e;
    }
    const body = osc(secs(0.08), (t) => 190 + 60 * Math.exp(-t / 0.01));
    env(body, expDecay(0.03));
    return mixInto(out, body, 0.35);
  },

  snare(len = 0.22) {
    const n = secs(len);
    const nz = filter(noise(n), 'bp', 2600, 0.7);
    env(nz, expDecay(0.07, 0.001));
    const tone = osc(n, (t) => 210 + 40 * Math.exp(-t / 0.015));
    env(tone, expDecay(0.04));
    return mixInto(nz, tone, 0.5);
  },

  hat(open = false) {
    const n = secs(open ? 0.32 : 0.07);
    const out = filter(filter(noise(n), 'hp', 7200), 'bp', 10000, 0.6);
    return env(out, expDecay(open ? 0.11 : 0.018, 0.0008));
  },

  crash(len = 2.2) {
    const n = secs(len);
    let out = filter(noise(n), 'hp', 3500);
    const ring = osc(n, 5400, 'square');
    const ring2 = osc(n, 7900, 'square');
    for (let i = 0; i < n; i += 1) out[i] = out[i] * 0.8 + ring[i] * ring2[i] * 0.12 * out[i];
    out = filter(out, 'lp', (t) => 16000 - 9000 * clamp(t / len, 0, 1));
    return env(out, expDecay(0.55, 0.002));
  },

  // Phonk cowbell: two detuned square partials through a bandpass.
  cowbell(len = 0.35) {
    const n = secs(len);
    const out = osc(n, 587, 'square');
    mixInto(out, osc(n, 845, 'square'), 0.8);
    return env(filter(out, 'bp', 1400, 2.2), expDecay(0.09, 0.001));
  },

  // Impact: pitched sub drop plus a noise body. Floors at 44 Hz so phones still feel it.
  boom(len = 1.8, { from = 90, to = 44, tau = 0.25 } = {}) {
    const n = secs(len);
    const floor = Math.max(to, 44);
    const sub = osc(n, (t) => floor + (Math.max(from, floor) - floor) * Math.exp(-t / tau));
    env(sub, (t) => (t < 0.004 ? t / 0.004 : Math.exp(-(t - 0.004) / 0.36)));
    for (let i = 0; i < n; i += 1) sub[i] = sat(sub[i] * 1.8, 1.6);
    const body = filter(noise(n, true), 'lp', (t) => 1400 * Math.exp(-t / 0.2) + 120);
    env(body, expDecay(0.25, 0.001));
    return mixInto(sub, body, 0.9);
  },

  // Filtered noise sweep. shape: swell | rise | fall.
  whoosh(len, { f0 = 400, f1 = 4000, q = 1.4, shape = 'swell' } = {}) {
    const n = secs(len);
    const out = filter(noise(n, true), 'bp', (t) => f0 * (f1 / f0) ** clamp(t / len, 0, 1), q);
    return env(out, (t) => {
      const x = t / len;
      if (shape === 'swell') return Math.sin(Math.PI * x) ** 1.6;
      if (shape === 'rise') return x ** 2.4 * (x > 0.97 ? (1 - x) / 0.03 : 1);
      return (1 - x) ** 2;
    });
  },

  riser(len) {
    const n = secs(len);
    const nz = filter(noise(n), 'bp', (t) => 300 * (40 ** clamp(t / len, 0, 1)), 2.2);
    const tone = filter(osc(n, (t) => 180 * (8 ** clamp(t / len, 0, 1)), 'saw'), 'lp', (t) => 400 + 5000 * (t / len) ** 2);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) out[i] = (nz[i] * 1.2 + tone[i] * 0.18) * (i / n) ** 2.2;
    return out;
  },

  // UI click / key tick.
  tick({ f = 3200, len = 0.02, q = 3 } = {}) {
    const n = secs(len);
    const out = filter(noise(n), 'bp', f, q);
    env(out, expDecay(0.004, 0.0003));
    const t2 = osc(n, f * 0.5);
    env(t2, expDecay(0.006));
    return mixInto(out, t2, 0.25);
  },

  // FM bell for confirmations, notifications, and sparkle.
  bell(freq, len = 1.2, { ratio = 3.5, index = 2.2, decay = 0.45 } = {}) {
    const n = secs(len);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const t = i / SR;
      const mod = Math.sin(TAU * freq * ratio * t) * index * Math.exp(-t / 0.18);
      out[i] = Math.sin(TAU * freq * t + mod) * (t < 0.002 ? t / 0.002 : Math.exp(-(t - 0.002) / decay));
    }
    return out;
  },

  blip(freq, len = 0.16) {
    const n = secs(len);
    const out = filter(osc(n, (t) => freq * (1 + 0.5 * Math.exp(-t / 0.01)), 'square'), 'lp', (t) => 1200 + 6000 * Math.exp(-t / 0.04));
    return env(out, expDecay(0.05, 0.001));
  },

  // Net swish (basketball), paper swipe, or card slide depending on level.
  swish(len = 0.42) {
    const n = secs(len);
    const nz = filter(filter(noise(n), 'hp', 1800), 'lp', (t) => 9000 - 5000 * (t / len));
    return env(nz, (t) => {
      const x = t / len;
      return (x < 0.12 ? x / 0.12 : 1) * (1 - x) ** 1.4 * (0.75 + 0.25 * Math.sin(TAU * 38 * t));
    });
  },

  // Ball bounce on hardwood: thump, shell ring, slap.
  bounce() {
    const n = secs(0.35);
    const thump = osc(n, (t) => 70 + 90 * Math.exp(-t / 0.012));
    env(thump, expDecay(0.07, 0.001));
    const shell = osc(n, (t) => 540 * (1 + 0.04 * Math.exp(-t / 0.02)));
    env(shell, expDecay(0.035, 0.0005));
    const slap = filter(noise(secs(0.03)), 'bp', 1800, 1.2);
    env(slap, expDecay(0.006, 0.0003));
    mixInto(thump, shell, 0.2);
    return mixInto(thump, slap, 0.5);
  },

  squeak(len = 0.2) {
    const n = secs(len);
    const out = filter(osc(n, (t) => 2300 + 700 * Math.sin(TAU * 26 * t) + 900 * (t / len), 'saw'), 'bp', 3000, 3);
    return env(out, (t) => Math.sin(Math.PI * clamp(t / len, 0, 1)) ** 0.8);
  },

  // Arena horn.
  buzzer(len = 0.95) {
    const n = secs(len);
    const out = new Float32Array(n);
    for (const [f, g] of [[196, 1], [233.1, 0.8], [293.7, 0.6], [197.2, 0.7]]) mixInto(out, osc(n, f, 'square'), g * 0.25);
    const shaped = filter(filter(out, 'bp', 900, 0.8), 'lp', 3200);
    return env(shaped, (t) => (t < 0.015 ? t / 0.015 : 1) * (t > len - 0.08 ? Math.max(0, (len - t) / 0.08) : 1));
  },

  // Crowd bed: many band-limited voices with independent swells. Keep it low in the mix.
  crowd(len, shape = () => 1) {
    const n = secs(len);
    const out = new Float32Array(n);
    for (let v = 0; v < 18; v += 1) {
      const voice = filter(noise(n, true), 'bp', rnd(350, 2600), rnd(1.2, 3));
      const rate = rnd(1.5, 5);
      const ph = rnd(0, TAU);
      for (let i = 0; i < n; i += 1) out[i] += voice[i] * (0.55 + 0.45 * Math.sin(TAU * rate * (i / SR) + ph)) * 0.25;
    }
    return env(filter(out, 'lp', 4200), shape);
  },

  // Vinyl crackle for lo-fi.
  vinyl(len) {
    const n = secs(len);
    const out = filter(noise(n, true), 'bp', 3000, 0.5);
    for (let i = 0; i < n; i += 1) {
      out[i] *= 0.08;
      if (rand() < 0.0009) out[i] += (rand() * 2 - 1) * 0.9;
    }
    return out;
  },

  // Detuned saw chord with an optional moving filter. Returns [L, R].
  supersaw(midis, len, { cutoff = 2000, q = 0.8, voices = 5, detune = 0.12, attack = 0.02, release = 0.2 } = {}) {
    const n = secs(len);
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    for (const m of midis) {
      for (let v = 0; v < voices; v += 1) {
        const spread = voices === 1 ? 0 : (v / (voices - 1)) * 2 - 1;
        const wave = osc(n, noteHz(m) * 2 ** ((spread * detune) / 12), 'saw', rand());
        const gl = Math.cos(((spread * 0.8 + 1) * Math.PI) / 4);
        const gr = Math.sin(((spread * 0.8 + 1) * Math.PI) / 4);
        for (let i = 0; i < n; i += 1) {
          L[i] += wave[i] * gl;
          R[i] += wave[i] * gr;
        }
      }
    }
    const fl = filter(L, 'lp', cutoff, q);
    const fr = filter(R, 'lp', cutoff, q);
    const scale = 1 / Math.sqrt(midis.length * voices);
    for (let i = 0; i < n; i += 1) {
      const t = i / SR;
      const g = (t < attack ? t / attack : 1) * (t > len - release ? Math.max(0, (len - t) / release) : 1) * scale;
      fl[i] *= g;
      fr[i] *= g;
    }
    return [fl, fr];
  },

  stab(midis, len = 0.5) {
    const [l, r] = inst.supersaw(midis, len, { cutoff: (t) => 900 + 7000 * Math.exp(-t / 0.08), q: 1.1, attack: 0.003, release: 0.12, detune: 0.18 });
    const e = expDecay(0.16, 0.003);
    for (let i = 0; i < l.length; i += 1) {
      l[i] *= e(i / SR);
      r[i] *= e(i / SR);
    }
    return [l, r];
  },

  pluck(midi, len = 0.25) {
    const out = filter(osc(secs(len), noteHz(midi), 'saw'), 'lp', (t) => 600 + 5200 * Math.exp(-t / 0.05), 1.4);
    return env(out, expDecay(0.1, 0.002));
  },

  // Soft electric-piano-ish keys for lo-fi and chill cuts. Returns [L, R].
  keys(midis, len = 1.6) {
    const n = secs(len);
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    midis.forEach((m, k) => {
      const tone = inst.bell(noteHz(m), len, { ratio: 1, index: 0.9, decay: 0.7 });
      const pan = (k / Math.max(1, midis.length - 1)) * 0.6 - 0.3;
      for (let i = 0; i < n; i += 1) {
        L[i] += tone[i] * Math.cos(((pan + 1) * Math.PI) / 4) * 0.35;
        R[i] += tone[i] * Math.sin(((pan + 1) * Math.PI) / 4) * 0.35;
      }
    });
    return [filter(L, 'lp', 3200), filter(R, 'lp', 3200)];
  },
};

// Decode any audio file ffmpeg can read into [L, R] at the mix rate: a track the user supplied
// (measure it first with beats.mjs) or a voiceover line. `from` and `seconds` cut an excerpt.
export function loadAudio(file, { from = 0, seconds = null } = {}) {
  const args = ['-v', 'error', ...(from ? ['-ss', String(from)] : []), ...(seconds ? ['-t', String(seconds)] : []), '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'];
  const r = spawnSync('ffmpeg', args, { maxBuffer: 2 ** 31 - 1 });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${String(r.stderr).trim()}`);
  const bytes = r.stdout;
  const pcm = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength - (bytes.byteLength % 8)));
  const n = pcm.length / 2;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    L[i] = pcm[i * 2];
    R[i] = pcm[i * 2 + 1];
  }
  return [L, R];
}

// Chord progressions as MIDI voicings (around C4). Transpose with .map(m => m + k).
export const PROGRESSIONS = {
  epicMinor: [[53, 56, 60, 65], [49, 53, 56, 61], [51, 55, 58, 63], [53, 57, 60, 65]], // Fm Db Eb F
  darkPhonk: [[54, 57, 61, 66], [54, 57, 61, 66], [52, 56, 59, 64], [50, 54, 57, 62]], // F#m F#m E D
  upliftMajor: [[48, 52, 55, 60], [55, 59, 62, 67], [57, 60, 64, 69], [53, 57, 60, 65]], // C G Am F
  lofiSevenths: [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [45, 48, 52, 55]], // Dm7 G7 Cmaj7 Am7
  tenseDrill: [[52, 55, 59, 64], [53, 56, 60, 65], [52, 55, 59, 64], [50, 53, 57, 62]], // Em F Em Dm
};

// Mix ------------------------------------------------------------------------------------------

export function createMix({ duration, seed: startSeed = 1337 }) {
  seed = startSeed;
  const N = Math.round(SR * duration);
  const makeBus = () => ({
    dryL: new Float32Array(N), dryR: new Float32Array(N),
    verbL: new Float32Array(N), verbR: new Float32Array(N),
    duckL: new Float32Array(N), duckR: new Float32Array(N),
  });
  const stems = { music: makeBus(), sfx: makeBus() };
  const kicks = [];
  const dips = [];

  // Lower the music stem between two times (under a voiceover line, or to clear room for a moment).
  function dip(from, to, depth = 0.5, fade = 0.12) {
    dips.push({ from, to, depth: clamp(depth, 0, 1), fade });
  }

  // Mono buffer into a stem. bus 'duck' (pads, bass) is sidechained under every kick.
  function place(buf, time, { gain = 1, pan = 0, send = 0, bus = 'dry', stem = bus === 'duck' ? 'music' : 'sfx' } = {}) {
    const start = Math.round(time * SR);
    const a = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
    const gl = Math.cos(a) * gain;
    const gr = Math.sin(a) * gain;
    const b = stems[stem];
    const [L, R] = bus === 'duck' ? [b.duckL, b.duckR] : [b.dryL, b.dryR];
    for (let i = 0; i < buf.length; i += 1) {
      const j = start + i;
      if (j < 0) continue;
      if (j >= N) break;
      L[j] += buf[i] * gl;
      R[j] += buf[i] * gr;
      if (send) {
        b.verbL[j] += buf[i] * gl * send;
        b.verbR[j] += buf[i] * gr * send;
      }
    }
  }

  function placeStereo([l, r], time, { gain = 1, send = 0, bus = 'dry', stem = 'music' } = {}) {
    const start = Math.round(time * SR);
    const b = stems[stem];
    const [L, R] = bus === 'duck' ? [b.duckL, b.duckR] : [b.dryL, b.dryR];
    for (let i = 0; i < l.length; i += 1) {
      const j = start + i;
      if (j < 0) continue;
      if (j >= N) break;
      L[j] += l[i] * gain;
      R[j] += r[i] * gain;
      if (send) {
        b.verbL[j] += l[i] * gain * send;
        b.verbR[j] += r[i] * gain * send;
      }
    }
  }

  function kick(time, opts = {}, gain = 1) {
    kicks.push(time);
    place(inst.kick(opts), time, { gain, stem: 'music' });
  }

  // One bar of drums in a genre. grid comes from beatGrid(); bar is the bar index.
  // Pass { kicks: false } when kicks come from the shared KICKS list (keeps world pulses in sync).
  function drums(grid, bar, style = 'trap', { level = 1, kicks: withKicks = true } = {}) {
    const at = (s) => grid.step(bar, s);
    const hats = (steps, gain = 0.22) => steps.forEach((s) => place(inst.hat(false), at(s), { gain: gain * level * (s % 4 === 0 ? 1 : 0.65), pan: 0.25, stem: 'music' }));
    const claps = (steps, gain = 0.65) => steps.forEach((s) => place(inst.clap(), at(s), { gain: gain * level, send: 0.35, stem: 'music' }));
    const kicksAt = (steps, opts = {}) => (withKicks ? steps.forEach((s) => kick(at(s), opts, level)) : null);
    const every = (n, from = 0) => Array.from({ length: Math.ceil((16 - from) / n) }, (_, i) => from + i * n);
    if (style === 'house') {
      kicksAt([0, 4, 8, 12], { p0: 150, decay: 0.22 });
      claps([4, 12], 0.5);
      hats(every(4, 2), 0.3);
      [2, 6, 10, 14].forEach((s) => place(inst.hat(true), at(s), { gain: 0.1 * level, pan: 0.3, stem: 'music' }));
    } else if (style === 'phonk') {
      kicksAt([0, 3, 8, 10], { p0: 190, decay: 0.3 });
      claps([8], 0.7);
      hats(every(2), 0.18);
      [0, 3, 6, 10, 13].forEach((s) => place(inst.cowbell(), at(s), { gain: 0.22 * level, pan: -0.15, send: 0.2, stem: 'music' }));
    } else if (style === 'drill') {
      kicksAt([0, 7, 10], { p0: 180 });
      claps([6, 14], 0.6);
      [0, 2, 3, 5, 8, 10, 11, 13, 15].forEach((s) => place(inst.hat(false), at(s), { gain: 0.2 * level, pan: 0.25, stem: 'music' }));
    } else if (style === 'lofi' || style === 'boombap') {
      kicksAt(style === 'lofi' ? [0, 7, 10] : [0, 5, 10], { p0: 120, decay: 0.2, click: 0.3 });
      [4, 12].forEach((s) => place(inst.snare(0.18), at(s), { gain: 0.5 * level, send: 0.3, stem: 'music' }));
      hats(every(2), 0.14);
    } else if (style === 'dnb') {
      kicksAt([0, 10], { p0: 170, decay: 0.18 });
      [4, 12].forEach((s) => place(inst.snare(0.2), at(s), { gain: 0.6 * level, send: 0.25, stem: 'music' }));
      hats(every(1), 0.12);
    } else if (style === 'hyperpop') {
      kicksAt([0, 4, 8, 12], { p0: 220, decay: 0.2 });
      claps([4, 12], 0.6);
      hats(every(1), 0.15);
    } else if (style === 'four') {
      kicksAt([0, 4, 8, 12], { p0: 180, decay: 0.3 });
      claps([0, 4, 8, 12], 0.4);
      hats(every(2), 0.2);
    } else {
      // trap (half-time): syncopated kicks, clap on 3, hats with a triplet roll on the last beat.
      kicksAt([0, 6, 11], { p0: 180, decay: 0.3 });
      claps([8], 0.72);
      hats([0, 2, 4, 6, 8, 10, 12], 0.24);
      place(inst.hat(true), at(14), { gain: 0.13 * level, pan: 0.3, stem: 'music' });
      for (let r = 0; r < 6; r += 1) place(inst.hat(false), at(12) + r * (grid.beat / 6), { gain: (0.08 + r * 0.02) * level, pan: 0.35, stem: 'music' });
    }
  }

  function reverb(inL, inR, { room = 0.86, damp = 0.35 } = {}) {
    const scale = SR / 44100;
    const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
    const apT = [556, 441, 341, 225];
    const make = (spread) => ({
      combs: combT.map((c) => ({ buf: new Float32Array(Math.round((c + spread) * scale)), i: 0, store: 0 })),
      aps: apT.map((a) => ({ buf: new Float32Array(Math.round((a + spread) * scale)), i: 0 })),
    });
    const chans = [make(0), make(23)];
    const fb = room * 0.28 + 0.7;
    const outs = [new Float32Array(N), new Float32Array(N)];
    [inL, inR].forEach((input, ch) => {
      const { combs, aps } = chans[ch];
      for (let n = 0; n < N; n += 1) {
        const x = input[n] * 0.015;
        let y = 0;
        for (const c of combs) {
          const o = c.buf[c.i];
          c.store = o * (1 - damp) + c.store * damp;
          c.buf[c.i] = x + c.store * fb;
          c.i = (c.i + 1) % c.buf.length;
          y += o;
        }
        for (const a of aps) {
          const bOut = a.buf[a.i];
          const o = -y + bOut;
          a.buf[a.i] = y + bOut * 0.5;
          a.i = (a.i + 1) % a.buf.length;
          y = o;
        }
        outs[ch][n] = y;
      }
    });
    return [filter(outs[0], 'hp', 220), filter(outs[1], 'hp', 220)];
  }

  function render(outPath, { shelfDb = 5, fadeOut = 0.35 } = {}) {
    const duck = new Float32Array(N).fill(1);
    for (const k of kicks) {
      const s0 = Math.round(k * SR);
      for (let i = 0; i < SR * 0.3 && s0 + i < N; i += 1) {
        const t = i / SR;
        duck[s0 + i] = Math.min(duck[s0 + i], 1 - 0.55 * Math.exp(-t / 0.09) * (t < 0.004 ? t / 0.004 : 1));
      }
    }
    const sum = (b) => {
      const [wl, wr] = reverb(b.verbL, b.verbR);
      const L = new Float32Array(N);
      const R = new Float32Array(N);
      for (let n = 0; n < N; n += 1) {
        L[n] = b.dryL[n] + b.duckL[n] * duck[n] + wl[n] * 3.2;
        R[n] = b.dryR[n] + b.duckR[n] * duck[n] + wr[n] * 3.2;
      }
      return [L, R];
    };
    // Master: clean the sub, lift presence for phone speakers, fade the tail, soft clip.
    const master = ([inL, inR]) => {
      const eq = [0, 1].map(() => [new Biquad('hp', 32, 0.7), new Biquad('hp', 32, 0.7), new Biquad('hs', 3600, 0.7, shelfDb)]);
      const oL = new Float32Array(N);
      const oR = new Float32Array(N);
      for (let n = 0; n < N; n += 1) {
        const t = n / SR;
        const fade = t > duration - fadeOut ? Math.max(0, (duration - t) / fadeOut) ** 1.5 : 1;
        const g = fade * Math.min(1, n / 64) * 0.55;
        let l = inL[n];
        let r = inR[n];
        for (const f of eq[0]) l = f.run(l);
        for (const f of eq[1]) r = f.run(r);
        oL[n] = sat(l * g, 1.15);
        oR[n] = sat(r * g, 1.15);
      }
      return [oL, oR];
    };
    const music = sum(stems.music);
    for (const d of dips) {
      for (let n = Math.max(0, Math.round((d.from - d.fade) * SR)); n < Math.min(N, Math.round((d.to + d.fade) * SR)); n += 1) {
        const t = n / SR;
        const g = 1 - d.depth * clamp(Math.min((t - (d.from - d.fade)) / d.fade, (d.to + d.fade - t) / d.fade), 0, 1);
        music[0][n] *= g;
        music[1][n] *= g;
      }
    }
    const sfx = sum(stems.sfx);
    const full = master([music[0].map((v, i) => v + sfx[0][i]), music[1].map((v, i) => v + sfx[1][i])]);
    writeWav(outPath, full);
    writeWav(outPath.replace(/\.wav$/, '-sfx.wav'), master(sfx));
  }

  return { N, place, placeStereo, kick, drums, dip, render, kicks };
}

// 32-bit float stereo WAV, peak-normalized to -1 dBFS. Loudness is finished at encode time.
export function writeWav(file, [L, R]) {
  const N = L.length;
  let peak = 1e-9;
  for (let n = 0; n < N; n += 1) peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
  const norm = dbToGain(-1) / peak;
  const bytes = 44 + N * 8;
  const buf = Buffer.alloc(bytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(bytes - 8, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 8, 28);
  buf.writeUInt16LE(8, 32);
  buf.writeUInt16LE(32, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(N * 8, 40);
  let o = 44;
  for (let n = 0; n < N; n += 1) {
    buf.writeFloatLE(L[n] * norm, o);
    buf.writeFloatLE(R[n] * norm, o + 4);
    o += 8;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  console.log(`${path.basename(file)} (peak before normalize ${(20 * Math.log10(peak)).toFixed(1)} dBFS)`);
}
