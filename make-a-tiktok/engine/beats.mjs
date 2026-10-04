#!/usr/bin/env node
// Measure a supplied track so the picture can be cut to it: tempo, beats, downbeats, and hits.
//
//   node beats.mjs audio/track.mp3 > beats.json
//   node beats.mjs audio/track.mp3 --from 32 --seconds 40 --min 80 --max 170
//
// The output gives `bpm` and `offset` (seconds of the first downbeat inside the excerpt). In
// src/cues.mjs use beatGrid(bpm, bars); in soundtrack.mjs place the track with
// loadAudio(file, { from: from + offset }) at time 0 so its downbeat lands on frame 0. Scene changes
// go on `downbeats`, state changes on `beats`, and sound design on `hits`.
//
// Use only a track the user supplied and has the right to post with. Needs ffmpeg.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fft } from './analyze-audio.mjs';

const RATE = 22050;
const F = 1024;
const HOP = 256;
const FPS = RATE / HOP;

function decode(file, from, seconds) {
  const args = ['-v', 'error', ...(from ? ['-ss', String(from)] : []), ...(seconds ? ['-t', String(seconds)] : []), '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(RATE), '-'];
  const r = spawnSync('ffmpeg', args, { maxBuffer: 2 ** 31 - 1 });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${String(r.stderr).trim()}`);
  const b = r.stdout;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength - (b.byteLength % 4)));
}

// Onset strength per frame (all bands), for the low band alone, and a coarse spectrum per frame
// (kicks and chord changes both mark downbeats).
const SPEC = 36;
function onsetEnvelopes(mono) {
  const win = Float32Array.from({ length: F }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (F - 1)));
  const count = Math.max(0, Math.floor((mono.length - F) / HOP) + 1);
  const all = new Float32Array(count);
  const low = new Float32Array(count);
  const prev = new Float32Array(F / 2);
  const re = new Float64Array(F);
  const im = new Float64Array(F);
  const lowBin = Math.ceil((160 * F) / RATE);
  const spectra = new Float32Array(count * SPEC);
  // Log-spaced bands from 80 Hz to 4 kHz.
  const bandOf = Int16Array.from({ length: F / 2 }, (_, k) => {
    const hz = (k * RATE) / F;
    return hz < 80 || hz > 4000 ? -1 : Math.min(SPEC - 1, Math.floor((Math.log2(hz / 80) / Math.log2(50)) * SPEC));
  });
  for (let f = 0; f < count; f += 1) {
    for (let i = 0; i < F; i += 1) {
      re[i] = mono[f * HOP + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    let a = 0;
    let l = 0;
    for (let k = 1; k < F / 2; k += 1) {
      const mag = Math.log1p(Math.sqrt(re[k] * re[k] + im[k] * im[k]) * 100);
      const rise = Math.max(0, mag - prev[k]);
      a += rise;
      if (k <= lowBin) l += rise;
      if (bandOf[k] >= 0) spectra[f * SPEC + bandOf[k]] += mag;
      prev[k] = mag;
    }
    all[f] = f === 0 ? 0 : a;
    low[f] = f === 0 ? 0 : l;
  }
  // Remove the slow-moving average so sustained loud passages do not read as onsets.
  const half = Math.round(FPS * 0.25);
  const flat = (src) => {
    const out = new Float32Array(src.length);
    let sum = 0;
    for (let i = 0; i < Math.min(half, src.length); i += 1) sum += src[i];
    for (let i = 0; i < src.length; i += 1) {
      if (i + half < src.length) sum += src[i + half];
      if (i - half - 1 >= 0) sum -= src[i - half - 1];
      const width = Math.min(src.length - 1, i + half) - Math.max(0, i - half) + 1;
      out[i] = Math.max(0, src[i] - sum / width);
    }
    return out;
  };
  return { all: flat(all), low: flat(low), spectra };
}

const sample = (env, frame) => {
  const i = Math.floor(frame);
  if (i < 0 || i + 1 >= env.length) return 0;
  return env[i] + (env[i + 1] - env[i]) * (frame - i);
};

// Sum of onset strength on a beat comb, at the best phase.
function comb(env, period, phases = 32) {
  let best = { score: -1, phase: 0 };
  for (let p = 0; p < phases; p += 1) {
    const phase = (p / phases) * period;
    let s = 0;
    let n = 0;
    for (let t = phase; t < env.length - 1; t += period) {
      s += sample(env, t);
      n += 1;
    }
    if (n && s / n > best.score) best = { score: s / n, phase };
  }
  return best;
}

export function measure(file, { from = 0, seconds = null, min = 70, max = 180 } = {}) {
  const mono = decode(file, from, seconds);
  const { all, low, spectra } = onsetEnvelopes(mono);
  // Coarse tempo from the autocorrelation, with a gentle preference for the middle of the range.
  const mean = all.reduce((s, v) => s + v, 0) / Math.max(1, all.length);
  let coarse = { score: -Infinity, bpm: 120 };
  for (let bpm = min; bpm <= max; bpm += 0.5) {
    const lag = (60 / bpm) * FPS;
    let s = 0;
    for (let i = Math.ceil(lag); i < all.length; i += 1) s += (all[i] - mean) * (sample(all, i - lag) - mean);
    // Count the bar as well as the beat, so a tempo is not mistaken for its half or double.
    const lag4 = lag * 4;
    for (let i = Math.ceil(lag4); i < all.length; i += 1) s += 0.5 * (all[i] - mean) * (sample(all, i - lag4) - mean);
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 118) / 0.9) ** 2);
    if (s * prior > coarse.score) coarse = { score: s * prior, bpm };
  }
  // Fine tempo and phase from a comb across the whole excerpt.
  let fine = { score: -1, bpm: coarse.bpm, phase: 0 };
  for (let bpm = coarse.bpm * 0.97; bpm <= coarse.bpm * 1.03; bpm += 0.02) {
    const c = comb(all, (60 / bpm) * FPS);
    if (c.score > fine.score) fine = { score: c.score, bpm, phase: c.phase };
  }
  const period = (60 / fine.bpm) * FPS;
  const refined = comb(all, period, 128);
  const beatFrames = [];
  for (let t = refined.phase; t < all.length - 1; t += period) beatFrames.push(t);
  // The downbeat is the beat-in-four where the harmony changes most and the low end hits hardest.
  const beatSpectrum = (i) => {
    const out = new Float64Array(SPEC);
    const a = Math.max(0, Math.round(beatFrames[i]));
    const b = Math.min(all.length, Math.round(beatFrames[i] + period));
    for (let f = a; f < b; f += 1) for (let k = 0; k < SPEC; k += 1) out[k] += spectra[f * SPEC + k];
    return out;
  };
  const spectraByBeat = beatFrames.map((_, i) => beatSpectrum(i));
  const change = spectraByBeat.map((cur, i) => {
    if (i === 0) return 0;
    const before = spectraByBeat[i - 1];
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let k = 0; k < SPEC; k += 1) {
      dot += cur[k] * before[k];
      na += cur[k] * cur[k];
      nb += before[k] * before[k];
    }
    return 1 - dot / (Math.sqrt(na * nb) || 1e-12);
  });
  const perPhase = (values) => {
    const sums = [0, 1, 2, 3].map((p) => values.reduce((s, v, i) => (i % 4 === p ? s + v : s), 0));
    const total = sums.reduce((s, v) => s + v, 0) || 1e-12;
    return sums.map((v) => v / total);
  };
  const lowShare = perPhase(beatFrames.map((t) => sample(low, t)));
  const changeShare = perPhase(change);
  const barScore = [0, 1, 2, 3].map((p) => lowShare[p] + 1.5 * changeShare[p]);
  const first = barScore.indexOf(Math.max(...barScore));
  const toSec = (frame) => Math.round(((frame * HOP + F / 2) / RATE) * 1000) / 1000;
  const beats = beatFrames.map(toSec);
  const downbeats = beats.filter((_, i) => i % 4 === first);
  // Hits: clear onset peaks, for placing sound design.
  const peak = Math.max(...all) || 1;
  const hits = [];
  for (let i = 2; i < all.length - 2; i += 1) {
    if (all[i] > 0.35 * peak && all[i] > all[i - 1] && all[i] >= all[i + 1] && (!hits.length || toSec(i) - hits[hits.length - 1] > 0.09)) hits.push(toSec(i));
  }
  const onBeat = beatFrames.reduce((s, t) => s + sample(all, t), 0) / Math.max(1, beatFrames.length);
  return {
    file,
    from,
    seconds: Math.round((mono.length / RATE) * 1000) / 1000,
    // Produced music is almost always at a whole tempo; a reading within 0.12 BPM snaps to it.
    bpm: Math.abs(fine.bpm - Math.round(fine.bpm)) < 0.12 ? Math.round(fine.bpm) : Math.round(fine.bpm * 100) / 100,
    bpmMeasured: Math.round(fine.bpm * 100) / 100,
    offset: downbeats[0] ?? beats[0] ?? 0,
    confidence: Math.round(Math.min(1, onBeat / (mean * 4 + 1e-9)) * 100) / 100,
    downbeatConfidence: Math.round((barScore[first] / (barScore.reduce((s, v) => s + v, 0) || 1)) * 100) / 100,
    alternates: [Math.round(fine.bpm * 200) / 100, Math.round(fine.bpm * 50) / 100],
    beats,
    downbeats,
    hits,
  };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) {
    console.error('usage: node beats.mjs <audio file> [--from s] [--seconds s] [--min bpm] [--max bpm] > beats.json');
    process.exit(1);
  }
  const opt = (k, d) => (rest.includes(`--${k}`) ? Number(rest[rest.indexOf(`--${k}`) + 1]) : d);
  const result = measure(file, { from: opt('from', 0), seconds: opt('seconds', null), min: opt('min', 70), max: opt('max', 180) });
  console.log(JSON.stringify(result, null, 1));
  console.error(`${result.bpm} BPM, first downbeat at ${result.offset}s, ${result.beats.length} beats, tempo confidence ${result.confidence}, downbeat confidence ${result.downbeatConfidence}`);
  console.error(`If the track feels twice as fast or slow, rerun with --min/--max around ${result.alternates.join(' or ')} BPM. Under 0.4 downbeat confidence, confirm the bar line on a spectrogram before cutting to it.`);
}
