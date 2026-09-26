#!/usr/bin/env node
// Procedural score and sound design for the showreel, locked to the same beat map as the
// picture. Everything is synthesized here: drums, 808, pads, stabs, risers, UI sounds, a net
// swish, crowd, and an arena buzzer. Writes a 48 kHz stereo float WAV.
//
//   node marketing/showreel/soundtrack.mjs [out/soundtrack.wav]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUE, KICKS } from './src/cues.mjs';
import { BEAT, BAR, DURATION } from './src/core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, process.argv[2] ?? 'out/soundtrack.wav');
const SR = 48000;
const N = Math.round(SR * DURATION);
const S16 = BEAT / 4;

// Buses -----------------------------------------------------------------------
// Two stems (music and sound design), each with a dry bus, a reverb send, and a
// bus that ducks under the kick.
const makeBus = () => ({
  dryL: new Float32Array(N),
  dryR: new Float32Array(N),
  verbL: new Float32Array(N),
  verbR: new Float32Array(N),
  duckL: new Float32Array(N),
  duckR: new Float32Array(N),
});
const STEMS = { music: makeBus(), sfx: makeBus() };

// Deterministic randomness
let seed = 1337;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const rnd = (a, b) => a + (b - a) * rand();

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const dbToGain = (db) => 10 ** (db / 20);
const noteHz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const TAU = Math.PI * 2;

// Place a mono buffer into a stereo bus with equal-power panning and an optional send.
function place(buf, time, { gain = 1, pan = 0, send = 0, bus = 'dry', stem = bus === 'duck' ? 'music' : 'sfx' } = {}) {
  const start = Math.round(time * SR);
  const a = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  const gl = Math.cos(a) * gain;
  const gr = Math.sin(a) * gain;
  const { dryL, dryR, duckL, duckR, verbL, verbR } = STEMS[stem];
  const [L, R] = bus === 'duck' ? [duckL, duckR] : [dryL, dryR];
  for (let i = 0; i < buf.length; i += 1) {
    const j = start + i;
    if (j < 0) continue;
    if (j >= N) break;
    const v = buf[i];
    L[j] += v * gl;
    R[j] += v * gr;
    if (send) {
      verbL[j] += v * gl * send;
      verbR[j] += v * gr * send;
    }
  }
}

function placeStereo(bufL, bufR, time, { gain = 1, send = 0, bus = 'dry', stem = 'music' } = {}) {
  const start = Math.round(time * SR);
  const { dryL, dryR, duckL, duckR, verbL, verbR } = STEMS[stem];
  const [L, R] = bus === 'duck' ? [duckL, duckR] : [dryL, dryR];
  for (let i = 0; i < bufL.length; i += 1) {
    const j = start + i;
    if (j < 0) continue;
    if (j >= N) break;
    L[j] += bufL[i] * gain;
    R[j] += bufR[i] * gain;
    if (send) {
      verbL[j] += bufL[i] * gain * send;
      verbR[j] += bufR[i] * gain * send;
    }
  }
}

// Primitives ------------------------------------------------------------------
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

class Biquad {
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
    let b0;
    let b1;
    let b2;
    if (type === 'hs') {
      const A = 10 ** (gainDb / 40);
      const al = (Math.sin(w0) / 2) * Math.SQRT2;
      const sq = 2 * Math.sqrt(A) * al;
      const a0 = A + 1 - (A - 1) * cos + sq;
      this.b0 = (A * (A + 1 + (A - 1) * cos + sq)) / a0;
      this.b1 = (-2 * A * (A - 1 + (A + 1) * cos)) / a0;
      this.b2 = (A * (A + 1 + (A - 1) * cos - sq)) / a0;
      this.a1 = (2 * (A - 1 - (A + 1) * cos)) / a0;
      this.a2 = (A + 1 - (A - 1) * cos - sq) / a0;
      return;
    }
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
    this.type = type;
    this.q = q;
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

// Filter a buffer with a (possibly time-varying) cutoff, updated every 16 samples.
function filter(buf, type, cutoff, q = 0.707) {
  const f = new Biquad(type, typeof cutoff === 'function' ? cutoff(0) : cutoff, q);
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i += 1) {
    if (typeof cutoff === 'function' && i % 16 === 0) f.set(type, cutoff(i / SR), q);
    out[i] = f.run(buf[i]);
  }
  return out;
}

function noise(len, pink = false) {
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

const secs = (d) => Math.max(1, Math.round(d * SR));
const env = (buf, fn) => {
  for (let i = 0; i < buf.length; i += 1) buf[i] *= fn(i / SR);
  return buf;
};
const expDecay = (tau, attack = 0.002) => (t) => (t < attack ? t / attack : Math.exp(-(t - attack) / tau));
const sat = (x, drive = 1) => Math.tanh(x * drive) / Math.tanh(drive);

function osc(len, freq, shape = 'sine', phase0 = 0) {
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

function mixInto(target, src, gain = 1, offset = 0) {
  for (let i = 0; i < src.length && i + offset < target.length; i += 1) target[i + offset] += src[i] * gain;
  return target;
}

// Instruments -----------------------------------------------------------------
function kick({ p0 = 170, p1 = 54, pitchTau = 0.04, decay = 0.26, click = 0.7, len = 0.5 } = {}) {
  const n = secs(len);
  const body = osc(n, (t) => p1 + (p0 - p1) * Math.exp(-t / pitchTau));
  env(body, (t) => (t < 0.003 ? t / 0.003 : Math.exp(-(t - 0.003) / decay)));
  for (let i = 0; i < n; i += 1) body[i] = sat(body[i] * 1.6, 1.4);
  const c = filter(noise(secs(0.012)), 'hp', 1800);
  env(c, expDecay(0.003, 0.0005));
  return mixInto(body, c, click);
}

function sub808(midi, len, { glideFrom = null, glideTau = 0.06, drive = 2.2, decay = 1.4 } = {}) {
  const n = secs(len);
  const f1 = noteHz(midi);
  const f0 = glideFrom === null ? f1 : noteHz(glideFrom);
  const out = osc(n, (t) => f1 + (f0 - f1) * Math.exp(-t / glideTau));
  env(out, (t) => (t < 0.004 ? t / 0.004 : Math.exp(-(t - 0.004) / decay)) * (t > len - 0.03 ? (len - t) / 0.03 : 1));
  for (let i = 0; i < n; i += 1) out[i] = sat(out[i], drive);
  return filter(out, 'lp', 1600);
}

function clap() {
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
}

function hat(open = false) {
  const n = secs(open ? 0.32 : 0.07);
  const out = filter(filter(noise(n), 'hp', 7200), 'bp', 10000, 0.6);
  return env(out, expDecay(open ? 0.11 : 0.018, 0.0008));
}

function snare(len = 0.22) {
  const n = secs(len);
  const nz = filter(noise(n), 'bp', 2600, 0.7);
  env(nz, expDecay(0.07, 0.001));
  const tone = osc(n, (t) => 210 + 40 * Math.exp(-t / 0.015));
  env(tone, expDecay(0.04));
  return mixInto(nz, tone, 0.5);
}

function crash(len = 2.2) {
  const n = secs(len);
  let out = filter(noise(n), 'hp', 3500);
  // A little metallic ring from a pair of inharmonic partials.
  const ring = osc(n, 5400, 'square');
  const ring2 = osc(n, 7900, 'square');
  for (let i = 0; i < n; i += 1) out[i] = out[i] * 0.8 + ring[i] * ring2[i] * 0.12 * out[i];
  out = filter(out, 'lp', (t) => 16000 - 9000 * clamp(t / len, 0, 1));
  return env(out, expDecay(0.55, 0.002));
}

function boom(len = 1.8, { from = 90, to = 32, tau = 0.25 } = {}) {
  const n = secs(len);
  const floor = Math.max(to, 44);
  const sub = osc(n, (t) => floor + (Math.max(from, floor) - floor) * Math.exp(-t / tau));
  env(sub, (t) => (t < 0.004 ? t / 0.004 : Math.exp(-(t - 0.004) / 0.36)));
  for (let i = 0; i < n; i += 1) sub[i] = sat(sub[i] * 1.8, 1.6);
  const body = filter(noise(n, true), 'lp', (t) => 1400 * Math.exp(-t / 0.2) + 120);
  env(body, expDecay(0.25, 0.001));
  return mixInto(sub, body, 0.9);
}

function whoosh(len, { f0 = 400, f1 = 4000, q = 1.4, shape = 'swell' } = {}) {
  const n = secs(len);
  const src = noise(n, true);
  const out = filter(src, 'bp', (t) => f0 * (f1 / f0) ** clamp(t / len, 0, 1), q);
  return env(out, (t) => {
    const x = t / len;
    if (shape === 'swell') return Math.sin(Math.PI * x) ** 1.6;
    if (shape === 'rise') return x ** 2.4 * (x > 0.97 ? (1 - x) / 0.03 : 1);
    return (1 - x) ** 2;
  });
}

function riser(len) {
  const n = secs(len);
  const nz = filter(noise(n), 'bp', (t) => 300 * (40 ** clamp(t / len, 0, 1)), 2.2);
  const tone = osc(n, (t) => 180 * (8 ** clamp(t / len, 0, 1)), 'saw');
  const toneF = filter(tone, 'lp', (t) => 400 + 5000 * (t / len) ** 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const x = i / n;
    out[i] = (nz[i] * 1.2 + toneF[i] * 0.18) * x ** 2.2;
  }
  return out;
}

function tick({ f = 3200, len = 0.02, q = 3 } = {}) {
  const n = secs(len);
  const out = filter(noise(n), 'bp', f, q);
  env(out, expDecay(0.004, 0.0003));
  const t2 = osc(n, f * 0.5);
  env(t2, expDecay(0.006));
  return mixInto(out, t2, 0.25);
}

function bell(freq, len = 1.2, { ratio = 3.5, index = 2.2, decay = 0.45 } = {}) {
  const n = secs(len);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const t = i / SR;
    const idx = index * Math.exp(-t / 0.18);
    const mod = Math.sin(TAU * freq * ratio * t) * idx;
    out[i] = Math.sin(TAU * freq * t + mod) * (t < 0.002 ? t / 0.002 : Math.exp(-(t - 0.002) / decay));
  }
  return out;
}

function blip(freq, len = 0.16) {
  const n = secs(len);
  const out = osc(n, (t) => freq * (1 + 0.5 * Math.exp(-t / 0.01)), 'square');
  const f = filter(out, 'lp', (t) => 1200 + 6000 * Math.exp(-t / 0.04));
  return env(f, expDecay(0.05, 0.001));
}

function swish(len = 0.42) {
  const n = secs(len);
  const nz = filter(filter(noise(n), 'hp', 1800), 'lp', (t) => 9000 - 5000 * (t / len));
  return env(nz, (t) => {
    const x = t / len;
    return (x < 0.12 ? x / 0.12 : 1) * (1 - x) ** 1.4 * (0.75 + 0.25 * Math.sin(TAU * 38 * t));
  });
}

function dribble() {
  const n = secs(0.35);
  const thump = osc(n, (t) => 70 + 90 * Math.exp(-t / 0.012));
  env(thump, expDecay(0.07, 0.001));
  const shell = osc(n, (t) => 540 * (1 + 0.04 * Math.exp(-t / 0.02)));
  env(shell, expDecay(0.035, 0.0005));
  const slap = filter(noise(secs(0.03)), 'bp', 1800, 1.2);
  env(slap, expDecay(0.006, 0.0003));
  mixInto(thump, shell, 0.2);
  return mixInto(thump, slap, 0.5);
}

function squeak(len = 0.2) {
  const n = secs(len);
  const out = osc(n, (t) => 2300 + 700 * Math.sin(TAU * 26 * t) + 900 * (t / len), 'saw');
  const f = filter(out, 'bp', 3000, 3);
  return env(f, (t) => Math.sin(Math.PI * clamp(t / len, 0, 1)) ** 0.8);
}

function buzzer(len = 0.95) {
  const n = secs(len);
  const out = new Float32Array(n);
  for (const [f, g] of [[196, 1], [233.1, 0.8], [293.7, 0.6], [197.2, 0.7]]) {
    mixInto(out, osc(n, f, 'square'), g * 0.25);
  }
  let shaped = filter(out, 'bp', 900, 0.8);
  shaped = filter(shaped, 'lp', 3200);
  return env(shaped, (t) => (t < 0.015 ? t / 0.015 : 1) * (t > len - 0.08 ? Math.max(0, (len - t) / 0.08) : 1));
}

function crowd(len, shape) {
  const n = secs(len);
  const out = new Float32Array(n);
  // Many band-limited voices with independent swells read as an arena rather than wind.
  for (let v = 0; v < 18; v += 1) {
    const center = rnd(350, 2600);
    const voice = filter(noise(n, true), 'bp', center, rnd(1.2, 3));
    const rate = rnd(1.5, 5);
    const ph = rnd(0, TAU);
    for (let i = 0; i < n; i += 1) {
      const t = i / SR;
      out[i] += voice[i] * (0.55 + 0.45 * Math.sin(TAU * rate * t + ph)) * 0.25;
    }
  }
  const warm = filter(out, 'lp', 4200);
  return env(warm, shape);
}

// Supersaw chord with a filter that can move over time.
function supersaw(midis, len, { cutoff = 2000, q = 0.8, voices = 5, detune = 0.12, attack = 0.02, release = 0.2 } = {}) {
  const n = secs(len);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  midis.forEach((m) => {
    for (let v = 0; v < voices; v += 1) {
      const spread = voices === 1 ? 0 : (v / (voices - 1)) * 2 - 1;
      const f = noteHz(m) * 2 ** ((spread * detune) / 12);
      const wave = osc(n, f, 'saw', rand());
      const pan = spread * 0.8;
      const gl = Math.cos(((pan + 1) * Math.PI) / 4);
      const gr = Math.sin(((pan + 1) * Math.PI) / 4);
      for (let i = 0; i < n; i += 1) {
        L[i] += wave[i] * gl;
        R[i] += wave[i] * gr;
      }
    }
  });
  const fl = filter(L, 'lp', cutoff, q);
  const fr = filter(R, 'lp', cutoff, q);
  const scale = 1 / Math.sqrt(midis.length * voices);
  const e = (t) => (t < attack ? t / attack : 1) * (t > len - release ? Math.max(0, (len - t) / release) : 1);
  for (let i = 0; i < n; i += 1) {
    const g = e(i / SR) * scale;
    fl[i] *= g;
    fr[i] *= g;
  }
  return [fl, fr];
}

function stab(midis, len = 0.5) {
  const [l, r] = supersaw(midis, len, { cutoff: (t) => 900 + 7000 * Math.exp(-t / 0.08), q: 1.1, attack: 0.003, release: 0.12, detune: 0.18 });
  const e = expDecay(0.16, 0.003);
  for (let i = 0; i < l.length; i += 1) {
    const g = e(i / SR);
    l[i] *= g;
    r[i] *= g;
  }
  return [l, r];
}

function pluck(midi, len = 0.25) {
  const n = secs(len);
  const out = osc(n, noteHz(midi), 'saw');
  const f = filter(out, 'lp', (t) => 600 + 5200 * Math.exp(-t / 0.05), 1.4);
  return env(f, expDecay(0.1, 0.002));
}

// Arrangement -----------------------------------------------------------------
const bar = (k) => k * BAR;
const step = (barIndex, s) => bar(barIndex) + s * S16;
const kicks = [];
function hitKick(time, opts = {}, gain = 1) {
  kicks.push(time);
  place(kick(opts), time, { gain, stem: 'music' });
}

// Chord map (F minor): the hook, the ask, and the scan loop Fm Fm Db Eb; the answer climbs Fm Db Eb
// into the drop; the drop section runs Fm Db Eb Fm Db Db Eb; the logo lands on F major (the win).
const FM = [53, 56, 60, 65];
const DB = [49, 53, 56, 61];
const EB = [51, 55, 58, 63];
const CHORDS = [FM, FM, DB, EB, FM, FM, DB, EB, FM, DB, EB, FM, DB, EB, FM, DB, DB, EB];
const ROOT_OF = new Map([[FM, 41], [DB, 37], [EB, 39]]);
const ROOTS = CHORDS.map((c) => ROOT_OF.get(c));
const DROP_BAR = Math.round(CUE.drop / BAR);
const END_BAR = Math.round(CUE.logo / BAR);
const MONTAGE_BARS = new Set([Math.round(CUE.stream / BAR), Math.round(CUE.stream / BAR) + 1]);

// Pads: filtered through the long build, open after the drop, hushed during the pre-drop gap.
for (let k = 0; k < END_BAR; k += 1) {
  const start = bar(k);
  const len = BAR + 0.05;
  const building = k < DROP_BAR;
  const cutoff = building
    ? (t) => 380 + 2200 * ((k * BAR + t) / bar(DROP_BAR)) ** 2
    : (t) => 3800 + 800 * Math.sin((TAU * (k * BAR + t)) / 3.75);
  const [l, r] = supersaw(CHORDS[k].map((m) => m + 12), len, { cutoff, q: 0.9, attack: k === DROP_BAR ? 0.005 : 0.08, release: 0.08 });
  if (k === DROP_BAR - 1) {
    // Gap before the drop.
    const cut = Math.round((CUE.suck - start) * SR);
    for (let i = cut; i < l.length; i += 1) {
      const g = Math.max(0, 1 - (i - cut) / (0.05 * SR));
      l[i] *= g;
      r[i] *= g;
    }
  }
  placeStereo(l, r, start, { gain: building ? 0.46 : 0.36, send: 0.25, bus: 'duck' });
}
{
  // Final chord: F major with a long tail under the logo, then a soft pad that holds the end card.
  const [l, r] = supersaw([53, 57, 60, 65, 69, 72], 3.6, { cutoff: (t) => 5200 * Math.exp(-t / 1.6) + 700, q: 0.9, attack: 0.004, release: 0.8 });
  placeStereo(l, r, CUE.logo, { gain: 0.5, send: 0.5 });
  const tail = DURATION - CUE.logo;
  const [pl, pr] = supersaw([65, 69, 72, 77], tail, { cutoff: (t) => 1100 + 500 * Math.sin((TAU * t) / 3.2), q: 0.7, attack: 1.2, release: 1.2 });
  placeStereo(pl, pr, CUE.logo + 0.4, { gain: 0.2, send: 0.5, stem: 'music' });
}

// Kicks come from the shared KICKS list so the court pulses with them.
for (const t of KICKS) {
  if (t < CUE.ask) hitKick(t, { p0: 190, decay: 0.28 }, 0.9);
  else if (t < CUE.drop) hitKick(t, { decay: 0.26 }, 0.8);
  else if (t < CUE.logo) hitKick(t, { p0: 180, decay: 0.3 }, 1);
  else hitKick(t, { p0: 200, decay: 0.4 }, 1);
}

// Bars 1-2: the hook. Dribbles on the beat, an impact on DOWN and on the record slam.
place(boom(1.6, { from: 110, to: 34 }), CUE.hook, { gain: 0.9, send: 0.25 });
place(crash(1.6), CUE.hook, { gain: 0.14, pan: 0.2, send: 0.2, stem: 'music' });
for (let beat = 0; beat < 8; beat += 1) place(dribble(), bar(0) + beat * BEAT, { gain: beat < 4 ? 0.75 : 0.55, pan: -0.1, send: 0.22 });
place(snare(0.3), CUE.recordSlam, { gain: 0.45, send: 0.35, stem: 'music' });
place(sub808(ROOTS[0], BAR * 0.9, { decay: 0.9 }), CUE.recordSlam, { gain: 0.55, bus: 'duck' });
place(sub808(ROOTS[1], BAR * 0.95, { decay: 1.1 }), bar(1), { gain: 0.45, bus: 'duck' });
// Arena air and light hats keep the long hook bright on phone speakers.
place(crowd(3.7, (t) => Math.min(1, t / 0.3) * (t > 3.2 ? Math.max(0, (3.7 - t) / 0.5) : 1)), 0, { gain: 0.14, send: 0.2 });
for (let s = 0; s < 16; s += 2) place(hat(false), step(1, s), { gain: s % 4 === 0 ? 0.18 : 0.12, pan: 0.25, stem: 'music' });
for (let i = 0; i < 9; i += 1) {
  const at = CUE.tilesIn - 0.06 + i * 0.06 + 0.2;
  place(tick({ f: 2400 + i * 140, len: 0.03, q: 2 }), at, { gain: 0.3, pan: (i % 3 - 1) * 0.45 });
}
// Swing categories: a low two-note warning.
place(pluck(ROOTS[0] + 24 + 3, 0.3), CUE.swing, { gain: 0.35, send: 0.3, pan: -0.1, stem: 'music' });
place(pluck(ROOTS[0] + 24 + 2, 0.4), CUE.swing + S16 * 1.5, { gain: 0.35, send: 0.3, pan: 0.1, stem: 'music' });
place(whoosh(0.6, { f0: 600, f1: 4000 }), CUE.hookOut - 0.05, { gain: 0.42, pan: -0.3 });
place(squeak(0.18), CUE.hookOut + 0.1, { gain: 0.14, pan: 0.5, send: 0.2 });

// Bars 3-11: the ask, the scan, the answer. The groove builds under the UI.
for (let k = 2; k < DROP_BAR; k += 1) {
  const preDrop = k === DROP_BAR - 1;
  const dense = k >= 6;
  for (let s = 0; s < 16; s += dense ? 1 : 2) {
    if (preDrop && s >= 14) continue;
    const accent = s % 4 === 0 ? 1 : 0.6;
    place(hat(false), step(k, s), { gain: 0.22 * accent * (k < 4 ? 0.8 : 1), pan: 0.25, stem: 'music' });
  }
  if (!preDrop) place(clap(), step(k, 8), { gain: k < 4 ? 0.28 : 0.34, send: 0.3, stem: 'music' });
  place(sub808(ROOTS[k], BAR * (preDrop ? 0.8 : 0.95), { decay: 1.2 }), step(k, 0), { gain: 0.5, bus: 'duck' });
}
// Snare roll through the last bar of the build, accelerating into the gap.
{
  const k = DROP_BAR - 1;
  const hits = [];
  for (let s = 0; s < 8; s += 2) hits.push(step(k, s));
  for (let s = 8; s < 12; s += 1) hits.push(step(k, s));
  for (let s = 12; s < 14; s += 0.5) hits.push(step(k, s));
  const playable = [];
  for (const t of hits) if (t < CUE.suck - 0.01) playable.push(t);
  playable.forEach((t, i) => {
    place(snare(0.12), t, { gain: 0.12 + 0.28 * (i / playable.length), pan: 0.1, send: 0.2, stem: 'music' });
  });
}
place(riser(CUE.suck - bar(DROP_BAR - 2) + 0.05), bar(DROP_BAR - 2), { gain: 0.2, send: 0.2 });
// Reverse swell into the drop.
{
  const len = CUE.drop - CUE.suck;
  const sw = whoosh(len, { f0: 300, f1: 7000, q: 0.9, shape: 'rise' });
  place(sw, CUE.suck, { gain: 0.6, send: 0.1 });
}

// UI sounds for the chat.
place(whoosh(0.6, { f0: 300, f1: 2400 }), CUE.ask - 0.45, { gain: 0.35, pan: 0.2 });
{
  const typed = 26;
  for (let c = 0; c < typed; c += 2) {
    const at = CUE.typeStart + ((c + 1) / typed) * (CUE.typeEnd - CUE.typeStart);
    place(tick({ f: rnd(3600, 5200), len: 0.018, q: 4 }), at + rnd(-0.006, 0.006), { gain: rnd(0.16, 0.24), pan: rnd(-0.25, 0.25) });
  }
}
place(tick({ f: 1800, len: 0.03, q: 1.5 }), CUE.send - 0.03, { gain: 0.5 });
place(whoosh(0.35, { f0: 800, f1: 6000 }), CUE.send, { gain: 0.32, pan: 0.3 });
place(bell(noteHz(84), 0.6, { ratio: 2, index: 1.2, decay: 0.25 }), CUE.send + 0.02, { gain: 0.1, send: 0.4 });
// Thinking shimmer: a soft rising arpeggio.
[77, 80, 84, 89].forEach((m, i) => place(bell(noteHz(m), 0.5, { ratio: 3, index: 1, decay: 0.18 }), CUE.thinking + i * S16, { gain: 0.05, send: 0.5, pan: -0.4 + i * 0.25 }));

// Scan: camera crane, tool checks, a count-up, a sonar ping on each pass, the swish.
place(whoosh(0.8, { f0: 250, f1: 3000, q: 1 }), CUE.scan - 0.5, { gain: 0.42, pan: -0.2, send: 0.1 });
[0, 1, 2, 3].forEach((i) => {
  const at = CUE.scan + 0.2 + i * 0.25 + 0.15;
  place(tick({ f: 2600, len: 0.025, q: 2 }), at, { gain: 0.26, pan: -0.4 + i * 0.25 });
  place(bell(noteHz(88), 0.3, { ratio: 2, index: 0.6, decay: 0.08 }), at, { gain: 0.05, send: 0.3 });
});
for (let i = 0; i < 14; i += 1) {
  place(tick({ f: 5200, len: 0.012, q: 5 }), CUE.scan + 0.3 + i * 0.06 * (1 + i * 0.04), { gain: 0.1, pan: 0.3 });
}
[CUE.filter1, CUE.filter2, CUE.filter3].forEach((at, i) => {
  place(bell(noteHz(79 + i * 5), 0.9, { ratio: 1.5, index: 1.4, decay: 0.3 }), at, { gain: 0.12, send: 0.55, pan: 0 });
  place(whoosh(0.5, { f0: 1200, f1: 300, q: 2, shape: 'fall' }), at, { gain: 0.18, send: 0.2 });
});
place(swish(0.45), CUE.filter3 + 0.8, { gain: 0.5, pan: 0.1, send: 0.15 });
[84, 88, 91].forEach((m, i) => place(bell(noteHz(m), 0.8, { ratio: 2, index: 1.1, decay: 0.3 }), CUE.filter3 + 0.8 + i * 0.06, { gain: 0.08, send: 0.4 }));

// Answer: card reveal, streaming text, the add.
place(whoosh(0.6, { f0: 200, f1: 2600 }), CUE.answer - 0.35, { gain: 0.48, pan: 0.1 });
place(boom(0.6, { from: 70, to: 40 }), CUE.answer, { gain: 0.3 });
for (let w = 0; w < 7; w += 1) {
  place(tick({ f: rnd(2000, 2800), len: 0.02, q: 3 }), CUE.answerText + 0.08 + w * ((CUE.alternates - 0.13 - CUE.answerText) / 7), { gain: 0.08, pan: rnd(-0.2, 0.2) });
}
place(tick({ f: 1500, len: 0.04, q: 1.2 }), CUE.add - 0.02, { gain: 0.55 });
[81, 84, 89].forEach((m, i) => place(bell(noteHz(m), 0.7, { ratio: 2, index: 1.3, decay: 0.2 }), CUE.add + i * 0.06, { gain: 0.11, send: 0.4 }));

// Bars 12-14: the drop and the flip.
place(boom(2.2, { from: 120, to: 30, tau: 0.3 }), CUE.drop, { gain: 1.0, send: 0.25 });
place(crash(2.4), CUE.drop, { gain: 0.3, pan: -0.15, send: 0.3, stem: 'music' });
place(crowd(2.6, (t) => (t < 0.3 ? t / 0.3 : Math.exp(-(t - 0.3) / 0.9))), CUE.drop, { gain: 0.34, send: 0.2 });
for (let k = DROP_BAR; k < END_BAR; k += 1) {
  const montage = MONTAGE_BARS.has(k);
  place(clap(), step(k, 8), { gain: 0.72, send: 0.35, stem: 'music' });
  if (montage) [0, 4, 12].forEach((s) => place(clap(), step(k, s), { gain: 0.32, send: 0.35, stem: 'music' }));
  for (let s = 0; s < 16; s += 1) {
    if (s === 14) place(hat(true), step(k, s), { gain: 0.13, pan: 0.3, stem: 'music' });
    else if (s % 2 === 0 || (!montage && s > 12)) place(hat(false), step(k, s), { gain: (s % 4 === 0 ? 0.27 : 0.18), pan: 0.25, stem: 'music' });
  }
  if (!montage) {
    // Trap roll on the last beat.
    for (let r = 0; r < 6; r += 1) place(hat(false), step(k, 12) + r * (BEAT / 6), { gain: 0.08 + r * 0.02, pan: 0.35, stem: 'music' });
  }
  const glideFrom = k === DROP_BAR ? null : ROOTS[k - 1];
  place(sub808(ROOTS[k], BAR * 0.98, { glideFrom, decay: 2.2, drive: 2.6 }), step(k, 0), { gain: 0.75, bus: 'duck' });
}
[CUE.flipAst, CUE.flipStl].forEach((at, i) => {
  for (let c = 0; c < 7; c += 1) place(tick({ f: 1800 + c * 90, len: 0.02, q: 2.5 }), at + c * 0.03, { gain: 0.3 - c * 0.02, pan: i ? 0.25 : -0.25 });
  [84 + i * 2, 88 + i * 2, 91 + i * 2].forEach((m, j) => place(bell(noteHz(m), 0.9, { ratio: 3, index: 1.6, decay: 0.3 }), at + 0.22 + j * 0.04, { gain: 0.1, send: 0.45, pan: i ? 0.3 : -0.3 }));
});
place(boom(1.2, { from: 100, to: 38 }), CUE.upSlam, { gain: 0.7, send: 0.2 });
{
  const [l, r] = stab(FM.map((m) => m + 12), 0.7);
  placeStereo(l, r, CUE.upSlam, { gain: 0.5, send: 0.4 });
}
place(crowd(1.8, (t) => Math.sin(Math.PI * Math.min(1, t / 1.8)) ** 1.5), CUE.upSlam - 0.1, { gain: 0.22 });

// Bars 15-16: one stab and one whip per word.
[CUE.stream, CUE.sit, CUE.trade, CUE.justAsk].forEach((at, i) => {
  const chord = [DB, DB, EB, EB][i].map((m) => m + 12);
  const [l, r] = stab(chord, 0.45);
  placeStereo(l, r, at, { gain: 0.55, send: 0.35 });
  const pan = [0, 0.6, -0.6, 0][i];
  place(whoosh(0.4, { f0: 500, f1: 6000, q: 1.2 }), at - 0.3, { gain: 0.36, pan: -pan });
});

// Bars 17-18: rank-up blips, the fall into the logo.
place(whoosh(0.5, { f0: 400, f1: 3000 }), CUE.climb - 0.35, { gain: 0.32, pan: 0.2 });
[CUE.rank5, CUE.rank3, CUE.rank2, CUE.rank1].forEach((at, i) => {
  place(blip(noteHz([77, 80, 84, 89][i])), at + 0.1, { gain: 0.16, send: 0.3, pan: -0.3 + i * 0.2 });
});
[89, 93, 96].forEach((m, i) => place(bell(noteHz(m), 1.2, { ratio: 2, index: 1.5, decay: 0.4 }), CUE.rank1 + 0.18 + i * 0.06, { gain: 0.1, send: 0.5 }));
place(riser(1.2), CUE.logo - 1.2, { gain: 0.18 });
place(whoosh(0.32, { f0: 5000, f1: 300, q: 1.1, shape: 'swell' }), CUE.logo - 0.3, { gain: 0.6, send: 0.1 });

// Bars 19-21: the logo lands. Impact, buzzer, crowd, and the major chord ring out.
place(boom(2.2, { from: 130, to: 29, tau: 0.3 }), CUE.logo, { gain: 1.05, send: 0.3 });
place(clap(), CUE.logo, { gain: 0.6, send: 0.6, stem: 'music' });
place(crash(2.4), CUE.logo, { gain: 0.3, pan: 0.15, send: 0.4, stem: 'music' });
place(buzzer(0.9), CUE.logo + 0.02, { gain: 0.22, send: 0.25 });
place(crowd(2.6, (t) => (t < 0.25 ? t / 0.25 : 1) * Math.exp(-Math.max(0, t - 0.25) / 1.3) * (t > 2.3 ? Math.max(0, (2.6 - t) / 0.3) : 1)), CUE.logo, { gain: 0.36, send: 0.2 });
place(sub808(41, 2.2, { glideFrom: 39, decay: 1.4 }), CUE.logo, { gain: 0.5, stem: 'music' });
[CUE.tagline, CUE.cta].forEach((at, i) => {
  [89 + i * 3, 93 + i * 3, 96 + i * 3].forEach((m, j) => place(bell(noteHz(m), 1, { ratio: 2, index: 1.1, decay: 0.35 }), at + j * 0.06, { gain: 0.07, send: 0.5, pan: -0.2 + j * 0.2 }));
});
// Soft hats keep time under the end card.
for (let k = END_BAR + 1; k < Math.round(DURATION / BAR); k += 1) {
  for (let s = 0; s < 16; s += 2) place(hat(false), step(k, s), { gain: s % 4 === 0 ? 0.1 : 0.06, pan: 0.25, stem: 'music' });
}

// Sidechain: duck the pads and 808 under every kick.
const duckGain = new Float32Array(N).fill(1);
for (const k of kicks) {
  const s0 = Math.round(k * SR);
  for (let i = 0; i < SR * 0.3 && s0 + i < N; i += 1) {
    const t = i / SR;
    const g = 1 - 0.55 * Math.exp(-t / 0.09) * (t < 0.004 ? t / 0.004 : 1);
    duckGain[s0 + i] = Math.min(duckGain[s0 + i], g);
  }
}

// Freeverb-style reverb on a send bus.
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
    const out = outs[ch];
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
        const b = a.buf[a.i];
        const o = -y + b;
        a.buf[a.i] = y + b * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        y = o;
      }
      out[n] = y;
    }
  });
  return [filter(outs[0], 'hp', 220), filter(outs[1], 'hp', 220)];
}

// Sum a stem (dry + ducked + reverb returns) into stereo buffers.
function stemSum(bus) {
  const [wl, wr] = reverb(bus.verbL, bus.verbR);
  const L = new Float32Array(N);
  const R = new Float32Array(N);
  for (let n = 0; n < N; n += 1) {
    L[n] = bus.dryL[n] + bus.duckL[n] * duckGain[n] + wl[n] * 3.2;
    R[n] = bus.dryR[n] + bus.duckR[n] * duckGain[n] + wr[n] * 3.2;
  }
  return [L, R];
}

// Master: clean up the sub, lift presence for phone speakers, fade the tail, soft clip.
function master([inL, inR]) {
  const outL = new Float32Array(N);
  const outR = new Float32Array(N);
  const eq = [0, 1].map(() => [new Biquad('hp', 32, 0.7), new Biquad('hp', 32, 0.7), new Biquad('hs', 3600, 0.7, 5)]);
  for (let n = 0; n < N; n += 1) {
    const t = n / SR;
    const fade = t > DURATION - 0.35 ? Math.max(0, (DURATION - t) / 0.35) ** 1.5 : 1;
    const fadeIn = Math.min(1, n / 64);
    let l = inL[n];
    let r = inR[n];
    for (const f of eq[0]) l = f.run(l);
    for (const f of eq[1]) r = f.run(r);
    outL[n] = sat(l * fade * fadeIn * 0.55, 1.15);
    outR[n] = sat(r * fade * fadeIn * 0.55, 1.15);
  }
  return [outL, outR];
}

const musicStem = stemSum(STEMS.music);
const sfxStem = stemSum(STEMS.sfx);
const full = master([musicStem[0].map((v, i) => v + sfxStem[0][i]), musicStem[1].map((v, i) => v + sfxStem[1][i])]);
const sfxOnly = master(sfxStem);

function writeWav(file, [L, R]) {
  // Normalize peak to -1 dBFS; loudness is finished in the mux step.
  let peak = 0;
  for (let n = 0; n < N; n += 1) peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
  const norm = dbToGain(-1) / peak;
  const bytes = 44 + N * 2 * 4;
  const buf = Buffer.alloc(bytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(bytes - 8, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(3, 20); // IEEE float
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
  console.log(`${file} (peak before normalize ${(20 * Math.log10(peak)).toFixed(1)} dBFS)`);
}

writeWav(OUT, full);
writeWav(OUT.replace(/\.wav$/, '-sfx.wav'), sfxOnly);
