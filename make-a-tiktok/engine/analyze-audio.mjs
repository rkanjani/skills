#!/usr/bin/env node
// Audio measurements for a soundtrack you cannot listen to.
//
//   node analyze-audio.mjs out/soundtrack.wav "0-15,7.5-13"     octave-band balance per section
//   node analyze-audio.mjs out/soundtrack.wav --fingerprint     compact fingerprint as JSON
//   node analyze-audio.mjs a.wav --compare b.wav                how alike two soundtracks are
//
// Balance targets for phone speakers: 60-120 Hz loudest, 20-60 Hz a few dB under it, 2-4 kHz
// around -18 dB, 8-16 kHz around -20 to -24 dB.
//
// The fingerprint describes what a listener would call "the same track": the tonal balance, the
// shape of the energy over time, the rhythm, and the notes in use. `studio log` stores it per
// video and `studio check` compares it with earlier videos, so a soundtrack that repeats is caught
// by measurement rather than by ear.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export function readWav(file) {
  const buf = fs.readFileSync(file);
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos < buf.length - 8) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(pos + 8), ch: buf.readUInt16LE(pos + 10), sr: buf.readUInt32LE(pos + 12), bits: buf.readUInt16LE(pos + 22) };
    if (id === 'data') data = { off: pos + 8, size: Math.min(size, buf.length - pos - 8) };
    pos += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`${file} is not a WAV file this tool can read`);
  const bytes = fmt.bits / 8;
  const n = Math.floor(data.size / bytes / fmt.ch);
  const mono = new Float32Array(n);
  const read = (o) => {
    if (fmt.format === 3) return bytes === 8 ? buf.readDoubleLE(o) : buf.readFloatLE(o);
    if (bytes === 2) return buf.readInt16LE(o) / 32768;
    if (bytes === 3) return buf.readIntLE(o, 3) / 8388608;
    return buf.readInt32LE(o) / 2147483648;
  };
  for (let i = 0; i < n; i += 1) {
    let s = 0;
    for (let c = 0; c < fmt.ch; c += 1) s += read(data.off + (i * fmt.ch + c) * bytes);
    mono[i] = s / fmt.ch;
  }
  return { sr: fmt.sr, mono, duration: n / fmt.sr };
}

export function fft(re, im) {
  const N = re.length;
  for (let i = 1, j = 0; i < N; i += 1) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br;
        im[i + k + len / 2] = ai - bi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

export const BANDS = [[20, 60], [60, 120], [120, 250], [250, 500], [500, 1000], [1000, 2000], [2000, 4000], [4000, 8000], [8000, 16000]];
const hann = (F) => Float32Array.from({ length: F }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (F - 1)));

// Power spectra of windowed frames: calls fn(power, frameIndex, frameCount).
function frames(mono, sr, F, hop, a, b, fn) {
  const win = hann(F);
  const from = Math.floor(a * sr);
  const to = Math.min(mono.length, Math.floor(b * sr));
  const count = Math.max(0, Math.floor((to - from - F) / hop) + 1);
  const re = new Float64Array(F);
  const im = new Float64Array(F);
  const power = new Float64Array(F / 2);
  for (let f = 0; f < count; f += 1) {
    const start = from + f * hop;
    for (let i = 0; i < F; i += 1) {
      re[i] = mono[start + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < F / 2; k += 1) power[k] = re[k] * re[k] + im[k] * im[k];
    fn(power, f, count);
  }
  return count;
}

// Octave-band power between seconds a and b.
export function bandPower(mono, sr, a, b, F = 8192) {
  const acc = new Float64Array(BANDS.length);
  const count = frames(mono, sr, F, F / 2, a, b, (power) => {
    for (let k = 1; k < F / 2; k += 1) {
      const f = (k * sr) / F;
      for (let j = 0; j < BANDS.length; j += 1) if (f >= BANDS[j][0] && f < BANDS[j][1]) acc[j] += power[k];
    }
  });
  return { acc, count };
}

const r3 = (x) => Math.round(x * 1000) / 1000;
const db = (x) => 10 * Math.log10(Math.max(x, 1e-12));

export function fingerprint(input) {
  const { sr, mono, duration } = typeof input === 'string' ? readWav(input) : input;
  // Tonal balance: band levels in dB relative to the total.
  const { acc } = bandPower(mono, sr, 0, duration);
  const total = acc.reduce((s, v) => s + v, 0) || 1e-12;
  const bands = Array.from(acc, (v) => r3(db(v / total)));
  // Arc: energy in 16 equal slices, in dB relative to the loudest slice.
  const SLICES = 16;
  const energy = new Float64Array(SLICES);
  for (let i = 0; i < mono.length; i += 1) energy[Math.min(SLICES - 1, Math.floor((i / mono.length) * SLICES))] += mono[i] * mono[i];
  const top = Math.max(...energy) || 1e-12;
  const arc = Array.from(energy, (v) => r3(Math.max(-40, db(v / top))));
  // Rhythm and notes from a short-hop spectrogram.
  const F = 4096;
  const hop = 1024;
  const flux = [];
  const chroma = new Float64Array(12);
  let prev = null;
  let centroidSum = 0;
  let flatSum = 0;
  let n = 0;
  frames(mono, sr, F, hop, 0, duration, (power) => {
    let f = 0;
    let weight = 0;
    let weighted = 0;
    let logSum = 0;
    let lin = 0;
    let bins = 0;
    for (let k = 2; k < F / 2; k += 1) {
      const hz = (k * sr) / F;
      const mag = Math.sqrt(power[k]);
      if (prev) f += Math.max(0, Math.log1p(mag * 50) - prev[k]);
      weight += mag;
      weighted += mag * hz;
      if (hz >= 110 && hz <= 2200) chroma[((Math.round(12 * Math.log2(hz / 440)) % 12) + 12 + 9) % 12] += power[k];
      if (hz >= 200 && hz <= 8000) {
        logSum += Math.log(power[k] + 1e-12);
        lin += power[k];
        bins += 1;
      }
    }
    prev ??= new Float64Array(F / 2);
    for (let k = 2; k < F / 2; k += 1) prev[k] = Math.log1p(Math.sqrt(power[k]) * 50);
    flux.push(f);
    if (weight > 1e-6) {
      centroidSum += weighted / weight;
      flatSum += Math.exp(logSum / bins) / (lin / bins + 1e-12);
      n += 1;
    }
  });
  const chromaTotal = chroma.reduce((s, v) => s + v, 0) || 1e-12;
  // Rhythm: autocorrelation of the onset envelope at 24 lags from 0.1 s to 2 s.
  const mean = flux.reduce((s, v) => s + v, 0) / Math.max(1, flux.length);
  const centered = flux.map((v) => v - mean);
  const zero = centered.reduce((s, v) => s + v * v, 0) || 1e-12;
  const rate = sr / hop;
  const rhythm = Array.from({ length: 24 }, (_, i) => {
    const lag = Math.round((0.1 + (i * 1.9) / 23) * rate);
    let s = 0;
    for (let j = lag; j < centered.length; j += 1) s += centered[j] * centered[j - lag];
    return r3(s / zero);
  });
  // Onsets per second: flux peaks well above the local average.
  let onsets = 0;
  for (let i = 2; i < flux.length - 2; i += 1) {
    if (flux[i] > flux[i - 1] && flux[i] >= flux[i + 1] && flux[i] > mean * 1.8) onsets += 1;
  }
  return {
    v: 1,
    seconds: r3(duration),
    bands,
    arc,
    rhythm,
    chroma: Array.from(chroma, (v) => r3(v / chromaTotal)),
    centroid: Math.round(centroidSum / Math.max(1, n)),
    flatness: r3(flatSum / Math.max(1, n)),
    onsets: r3(onsets / Math.max(0.1, duration)),
  };
}

const cosine = (a, b) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na * nb) || 1e-12);
};
const closeness = (a, b, scale) => Math.max(0, 1 - Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length) / scale);

// 0 (nothing in common) to 1 (the same track). Parts are reported so a FAIL can say what repeats.
export function similarity(a, b) {
  // Chroma is compared at the best transposition: the same tune in another key is still the same tune.
  let notes = 0;
  for (let shift = 0; shift < 12; shift += 1) notes = Math.max(notes, cosine(a.chroma, b.chroma.map((_, i) => b.chroma[(i + shift) % 12])));
  const parts = {
    balance: closeness(a.bands, b.bands, 9),
    arc: closeness(a.arc, b.arc, 10),
    rhythm: Math.max(0, cosine(a.rhythm, b.rhythm)),
    notes: Math.max(0, (notes - 0.5) * 2),
    texture: Math.max(0, 1 - Math.abs(Math.log2((a.centroid + 1) / (b.centroid + 1))) / 1.2) * 0.5
      + Math.max(0, 1 - Math.abs(a.onsets - b.onsets) / 4) * 0.5,
  };
  const score = 0.26 * parts.balance + 0.2 * parts.arc + 0.22 * parts.rhythm + 0.14 * parts.notes + 0.18 * parts.texture;
  return { score: r3(score), parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, r3(v)])) };
}

function main() {
  const [file, second, third] = process.argv.slice(2);
  if (!file) {
    console.log('usage: node analyze-audio.mjs <file.wav> ["0-15,7.5-13" | --fingerprint | --compare other.wav]');
    process.exit(1);
  }
  if (second === '--fingerprint') return console.log(JSON.stringify(fingerprint(file)));
  if (second === '--compare') {
    const { score, parts } = similarity(fingerprint(file), fingerprint(third));
    return console.log(`similarity ${(score * 100).toFixed(0)}%  ${Object.entries(parts).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join('  ')}`);
  }
  const { sr, mono } = readWav(file);
  const sections = (second ?? '0-15').split(',').map((s) => s.split('-').map(Number));
  for (const [a, b] of sections) {
    const { acc, count } = bandPower(mono, sr, a, b);
    const ref = Math.max(...acc);
    console.log(`\n${a}-${b}s (${count} frames), dB relative to loudest band:`);
    BANDS.forEach(([lo, hi], j) => {
      const level = 10 * Math.log10(acc[j] / ref);
      console.log(`  ${String(lo).padStart(5)}-${String(hi).padEnd(5)} Hz ${level.toFixed(1).padStart(6)} ${'#'.repeat(Math.max(0, Math.round(40 + level)))}`);
    });
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
