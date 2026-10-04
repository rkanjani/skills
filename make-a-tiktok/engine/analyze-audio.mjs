#!/usr/bin/env node
// Octave-band balance of a WAV, overall and per section. Targets for phone speakers: 60-120 Hz
// loudest, 20-60 Hz a few dB under it, 2-4 kHz around -18 dB, 8-16 kHz around -20 to -24 dB.
//   node analyze-audio.mjs out/soundtrack.wav "0-15,7.5-13"
// Long-term average spectrum in octave bands, plus per-section band levels.
import fs from 'node:fs';

const file = process.argv[2];
const buf = fs.readFileSync(file);
// Minimal WAV parse: find 'fmt ' and 'data'
let pos = 12;
let fmt = null;
let data = null;
while (pos < buf.length) {
  const id = buf.toString('ascii', pos, pos + 4);
  const size = buf.readUInt32LE(pos + 4);
  if (id === 'fmt ') fmt = { format: buf.readUInt16LE(pos + 8), ch: buf.readUInt16LE(pos + 10), sr: buf.readUInt32LE(pos + 12), bits: buf.readUInt16LE(pos + 22) };
  if (id === 'data') data = { off: pos + 8, size };
  pos += 8 + size + (size % 2);
}
const n = data.size / (fmt.bits / 8) / fmt.ch;
const mono = new Float32Array(n);
for (let i = 0; i < n; i += 1) {
  let s = 0;
  for (let c = 0; c < fmt.ch; c += 1) {
    const o = data.off + (i * fmt.ch + c) * (fmt.bits / 8);
    s += fmt.format === 3 ? buf.readFloatLE(o) : buf.readInt16LE(o) / 32768;
  }
  mono[i] = s / fmt.ch;
}

function fft(re, im) {
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

const bands = [[20, 60], [60, 120], [120, 250], [250, 500], [500, 1000], [1000, 2000], [2000, 4000], [4000, 8000], [8000, 16000]];
const sections = (process.argv[3] ?? '0-15').split(',').map((s) => s.split('-').map(Number));
const F = 8192;
const win = Float32Array.from({ length: F }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (F - 1)));
for (const [a, b] of sections) {
  const acc = new Float64Array(bands.length);
  let frames = 0;
  for (let start = Math.floor(a * fmt.sr); start + F <= Math.floor(b * fmt.sr); start += F / 2) {
    const re = new Float64Array(F);
    const im = new Float64Array(F);
    for (let i = 0; i < F; i += 1) re[i] = mono[start + i] * win[i];
    fft(re, im);
    for (let k = 1; k < F / 2; k += 1) {
      const f = (k * fmt.sr) / F;
      const p = re[k] * re[k] + im[k] * im[k];
      bands.forEach(([lo, hi], j) => {
        if (f >= lo && f < hi) acc[j] += p;
      });
    }
    frames += 1;
  }
  const ref = Math.max(...acc);
  console.log(`\n${a}-${b}s (${frames} frames), dB relative to loudest band:`);
  bands.forEach(([lo, hi], j) => {
    const db = 10 * Math.log10(acc[j] / ref);
    console.log(`  ${String(lo).padStart(5)}-${String(hi).padEnd(5)} Hz ${db.toFixed(1).padStart(6)} ${'#'.repeat(Math.max(0, Math.round(40 + db)))}`);
  });
}
