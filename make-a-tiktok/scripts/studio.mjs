#!/usr/bin/env node
// Studio CLI for make-a-tiktok: the content ledger, the variation engine, and project scaffolding.
// No dependencies. Run `node studio.mjs help`.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { designKit, describeKit, FAMILIES, FAMILY_IDS, SHAPES, SIGNATURE_FIELDS, signatureOf, soundDistance, hashSeed, rngFrom as kitRng } from '../engine/lib/soundkit.mjs';
import { fingerprint, similarity } from '../engine/analyze-audio.mjs';

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = JSON.parse(fs.readFileSync(path.join(skillDir, 'assets', 'axes.json'), 'utf8'));
const AXES = Object.keys(CATALOG.weights);
const STATUSES = ['scripting', 'building', 'rendered', 'posted', 'failed', 'archived'];
// Axes whose values are not tied to one app: the ones compared with videos made for other apps.
const PORTABLE = AXES.filter((a) => !['feature', 'persona', 'length', 'palette'].includes(a));
// What every review round scores, 1 to 10.
const REVIEW = {
  hook: 'the hook lands in the first 2 s',
  read: 'readable at phone size',
  motion: 'motion quality: springs, no pops, no dead frames',
  variety: 'something new on screen every 2 to 4 s',
  composition: 'composition and depth',
  brand: 'brand accuracy: real UI, real colors, real fonts',
  sync: 'sound sync',
  distinct: 'looks and sounds unlike the recent videos in the gallery',
};
// Videos scaffolded before sound kits and the newer axes existed keep passing the rules they had.
const modern = (v) => Number(v.engine ?? 1) >= 2;
// Renders started from here can find the skill's playwright-core wherever the skill is installed.
const renderEnv = { ...process.env, MAKE_A_TIKTOK_HOME: process.env.MAKE_A_TIKTOK_HOME ?? skillDir };
const r3 = (x) => Math.round(x * 1000) / 1000;

// Args ----------------------------------------------------------------------------------------
const [command = 'help', ...rest] = process.argv.slice(2);
const opts = { _: [] };
for (let i = 0; i < rest.length; i += 1) {
  if (rest[i].startsWith('--')) {
    const key = rest[i].slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) opts[key] = true;
    else {
      opts[key] = next;
      i += 1;
    }
  } else {
    opts._.push(rest[i]);
  }
}

const today = () => new Date().toISOString().slice(0, 10);
const readJson = (f, fallback = null) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback);
const writeJson = (f, data) => fs.writeFileSync(f, `${JSON.stringify(data, null, 2)}\n`);
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

// Studio discovery ------------------------------------------------------------------------------
function gitRoot(dir) {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

function findStudio() {
  if (opts.studio) return path.resolve(opts.studio);
  if (process.env.TIKTOK_STUDIO) return path.resolve(process.env.TIKTOK_STUDIO);
  let cur = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(cur, 'studio.json'))) return cur;
    const candidate = path.join(cur, 'marketing', 'tiktok');
    if (fs.existsSync(path.join(candidate, 'studio.json'))) return candidate;
    const up = path.dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return null;
}

function requireStudio() {
  const dir = findStudio();
  if (!dir || !fs.existsSync(path.join(dir, 'studio.json'))) {
    fail('No studio found. Run `studio.mjs init --app <slug> --name "<App>"` (defaults to <repo>/marketing/tiktok) or pass --studio <dir>.');
  }
  return dir;
}

function loadStudio(dir) {
  const studio = readJson(path.join(dir, 'studio.json'));
  const brand = readJson(path.join(dir, 'brand', 'brand.json'), {});
  const rules = { ...CATALOG.rules, ...(studio.rules ?? {}) };
  setBoilerplate(brand);
  // This app's catalog: the shared one, minus values the brand rules out, plus its own.
  const catalog = {};
  for (const axis of AXES) catalog[axis] = [...(CATALOG.axes[axis] ?? [])];
  for (const source of [brand.axes, studio.axes]) {
    for (const [axis, ids] of Object.entries(source?.remove ?? {})) {
      if (catalog[axis]) catalog[axis] = catalog[axis].filter((v) => !ids.includes(v.id));
    }
    for (const [axis, items] of Object.entries(source?.add ?? {})) {
      if (!catalog[axis]) continue;
      for (const item of items) {
        const entry = typeof item === 'string' ? { id: item, how: '' } : item;
        if (!catalog[axis].some((v) => v.id === entry.id)) catalog[axis].push({ ...entry, app: true });
      }
    }
  }
  // The brand's sonic identity narrows the music axis: families it avoids are out, and when it
  // names the families it likes, only those (and supplied tracks) stay.
  const avoid = brand.sound?.avoid ?? [];
  const liked = brand.sound?.families ?? [];
  const narrowed = catalog.music.filter((m) => !m.family || (!avoid.includes(m.family) && (!liked.length || liked.includes(m.family))));
  if (narrowed.length >= 3) catalog.music = narrowed;
  // A supplied track is only on offer when the studio has one (audio files in <studio>/audio).
  const audioDir = path.join(dir, 'audio');
  const hasTrack = fs.existsSync(audioDir) && fs.readdirSync(audioDir).some((f) => /\.(wav|mp3|m4a|aac|flac|ogg)$/i.test(f));
  if (!hasTrack) catalog.music = catalog.music.filter((m) => m.id !== 'supplied-track');
  catalog.feature = (brand.features ?? []).map((f) => ({ id: f.id, how: f.proof ?? '' }));
  catalog.persona = (studio.personas?.length ? studio.personas : brand.personas ?? []).map((p) => ({ id: p.id, how: p.desc ?? '' }));
  const values = Object.fromEntries(AXES.map((axis) => [axis, catalog[axis].map((v) => v.id)]));
  const app = studio.app ?? brand.app ?? path.basename(dir);
  return { dir, studio, brand, rules, values, catalog, app };
}

function loadVideos(dir) {
  const vdir = path.join(dir, 'videos');
  if (!fs.existsSync(vdir)) return [];
  return fs.readdirSync(vdir)
    .filter((d) => fs.existsSync(path.join(vdir, d, 'meta.json')))
    .map((d) => withSceneCopy({ ...readJson(path.join(vdir, d, 'meta.json')), dir: path.join(vdir, d), folder: d }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

// Scene copy is the source of on-screen text; `copy` is derived from it when a video omits it.
function withSceneCopy(v) {
  if ((!Array.isArray(v.copy) || !v.copy.length) && Array.isArray(v.scenes)) v.copy = v.scenes.flatMap((s) => s.copy ?? []);
  return v;
}

// Words a viewer reads: whitespace tokens with a letter or digit ("+", "·", and "/" are free).
const countWords = (list) => (Array.isArray(list) ? list : [list]).join(' ').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

// Length is bucketed so the axis varies without forcing exact durations: content sets the length.
function lengthBucket(seconds) {
  const buckets = CATALOG.axes.length ?? [];
  const hit = buckets.find((b) => Number(seconds) <= b.upTo) ?? buckets[buckets.length - 1];
  return hit?.id ?? String(Math.round(Number(seconds)));
}

// Pace check: each scene needs a settle-in time plus reading time per word of its copy.
function paceProblems(v, rules) {
  const errors = [];
  const warns = [];
  const { sceneBaseSeconds: base = 1.5, secondsPerWord: perWord = 0.3, minSceneSeconds: minScene = 2 } = rules;
  const scenes = Array.isArray(v.scenes) ? v.scenes : [];
  if (!scenes.length) {
    errors.push('meta.json needs scenes: [{ id, at, out, copy }] so the pace can be checked (see references/script-format.md)');
    return { errors, warns };
  }
  let prevOut = 0;
  for (const sc of scenes) {
    const at = Number(sc.at);
    const out = Number(sc.out);
    const words = countWords(sc.copy ?? []);
    const need = Math.max(minScene, base + perWord * words);
    if (!(out > at)) errors.push(`scene ${sc.id}: out (${sc.out}) must come after at (${sc.at})`);
    else if (out - at + 0.01 < need) errors.push(`scene ${sc.id} lasts ${(out - at).toFixed(1)}s but its ${words} words need ${need.toFixed(1)}s (${base}s + ${perWord}s per word). Give it more bars or cut copy`);
    if (at < prevOut - 0.05) warns.push(`scene ${sc.id} starts before the previous scene ends; overlapping scenes read as mud`);
    else if (at - prevOut > 0.6) warns.push(`${(at - prevOut).toFixed(1)}s gap before scene ${sc.id}; fill it or close it`);
    prevOut = Math.max(prevOut, out);
  }
  if (Math.abs(prevOut - Number(v.length)) > 0.1) warns.push(`the last scene ends at ${prevOut}s but the video is ${v.length}s long`);
  return { errors, warns };
}

// Only produced or in-flight work counts toward novelty; failed and archived ideas are free again.
const countable = (v) => !['failed', 'archived'].includes(v.status);

// Structure -------------------------------------------------------------------------------------
// The rhythm of a video as one letter per scene: S under 3 s, M under 5 s, L under 8 s, X longer.
function shapeOf(v) {
  const letter = (d) => (d < 3 ? 'S' : d < 5 ? 'M' : d < 8 ? 'L' : 'X');
  return (Array.isArray(v.scenes) ? v.scenes : []).map((sc) => letter(Number(sc.out) - Number(sc.at))).join('');
}

// Whole bars per story beat, in proportion to each beat's share of the format.
function planScenes(beats, bars, barSeconds, minBars) {
  if (!beats.length) return [];
  const alloc = beats.map((b) => Math.max(minBars, Math.round(b.share * bars)));
  let diff = bars - alloc.reduce((a, b) => a + b, 0);
  for (let guard = 0; diff !== 0 && guard < 400; guard += 1) {
    const want = beats.map((b, i) => b.share * bars - alloc[i]);
    if (diff > 0) {
      alloc[want.indexOf(Math.max(...want))] += 1;
      diff -= 1;
    } else {
      const open = want.map((w, i) => (alloc[i] > minBars ? w : Infinity));
      const i = open.indexOf(Math.min(...open));
      if (open[i] === Infinity) break;
      alloc[i] -= 1;
      diff += 1;
    }
  }
  let bar = 0;
  return beats.map((b, i) => {
    const at = bar * barSeconds;
    bar += alloc[i];
    return { id: b.id, at: r3(at), out: r3(bar * barSeconds), bars: alloc[i], copy: [] };
  });
}

// Portfolio -------------------------------------------------------------------------------------
// Every studio on this machine records its finished videos here, so the first video for a new app
// can differ from what was just made for another one. Set TIKTOK_PORTFOLIO to move it, or to
// "off" to compare inside one studio only.
const PORTFOLIO_FILE = process.env.TIKTOK_PORTFOLIO === 'off' ? null : path.resolve(process.env.TIKTOK_PORTFOLIO ?? path.join(os.homedir(), '.make-a-tiktok', 'portfolio.json'));

function loadPortfolio() {
  if (!PORTFOLIO_FILE) return [];
  try {
    return readJson(PORTFOLIO_FILE, []) ?? [];
  } catch {
    return [];
  }
}

const PORTFOLIO_DIR = PORTFOLIO_FILE ? path.dirname(PORTFOLIO_FILE) : null;

// A copy of a video's strip, kept with the portfolio so the gallery still works after the
// worktree that made the video is deleted. Nothing is ever written into another studio.
function portfolioSheet(app, v) {
  if (!PORTFOLIO_DIR) return null;
  const dst = path.join(PORTFOLIO_DIR, 'sheets', `${app}-${v.id}.jpg`);
  try {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const own = path.join(v.dir, 'sheet.jpg');
    if (fs.existsSync(own)) {
      if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(own).size) fs.copyFileSync(own, dst);
      return dst;
    }
    return fs.existsSync(dst) ? dst : makeSheet(v, dst);
  } catch {
    return fs.existsSync(dst) ? dst : null;
  }
}

// What an older video's sound was, as far as its ledger entry says: the instrument family its
// music value names, and the build-and-drop arc every bed had before arrangement shapes existed.
function inferredSound(ctx, v) {
  const music = musicEntry(ctx, v.axes?.music);
  if (!music?.family) return null;
  const bed = (v.blocks_used ?? v.blocks_planned ?? []).some((b) => b.startsWith('arrangement-'));
  return { family: music.family, groove: music.groove ?? null, shape: bed ? 'build-drop' : null, inferred: true };
}
const withSound = (ctx, list) => list.map((h) => (h.sound ? h : { ...h, sound: inferredSound(ctx, h) }));

function portfolioEntry(ctx, v, known) {
  return {
    key: `${ctx.app}#${v.id}`, app: ctx.app, name: ctx.brand.name ?? ctx.app, studio: ctx.dir, id: v.id, slug: v.slug,
    date: v.created ?? today(), status: v.status, axes: v.axes ?? {}, hook_line: v.hook_line ?? '', shape: shapeOf(v),
    sound: v.sound ? signatureOf(v.sound) : inferredSound(ctx, v), look: v.look?.name || null, blocks: v.blocks_used ?? v.blocks_planned ?? [],
    audio_fp: v.audio_fp ?? known?.audio_fp ?? audioFingerprint(v), sheet: portfolioSheet(ctx.app, v),
  };
}

// Record a studio's finished videos. The portfolio is a convenience: a read-only home directory
// must never stop a run, so every failure here is silent.
function syncPortfolio(ctx, videos) {
  if (!PORTFOLIO_FILE || ctx.rules.portfolio === false) return 0;
  try {
    const byKey = new Map(loadPortfolio().map((e) => [e.key, e]));
    let changed = 0;
    for (const v of videos.filter((x) => ['rendered', 'posted'].includes(x.status))) {
      const known = byKey.get(`${ctx.app}#${v.id}`);
      const entry = portfolioEntry(ctx, v, known);
      // Another checkout of the same app may hold the render; keep what it measured.
      entry.sheet ??= known?.sheet ?? null;
      if (JSON.stringify(known) === JSON.stringify(entry)) continue;
      byKey.set(entry.key, entry);
      changed += 1;
    }
    if (!changed) return 0;
    fs.mkdirSync(path.dirname(PORTFOLIO_FILE), { recursive: true });
    writeJson(PORTFOLIO_FILE, [...byKey.values()].sort((x, y) => String(x.date).localeCompare(String(y.date)) || x.key.localeCompare(y.key)));
    return changed;
  } catch {
    return 0;
  }
}

// Find the other studios on this machine without being told where they are: repositories that sit
// next to this one (and their worktrees) with a marketing/tiktok studio. Read-only on them; what
// is learned goes into the portfolio. Never looks at or above the home directory.
let discovered = null;
function discoverStudios(ctx) {
  if (discovered) return discovered;
  discovered = [];
  if (!PORTFOLIO_FILE || ctx.rules.portfolio === false) return discovered;
  try {
    const home = os.homedir();
    const repo = gitRoot(ctx.dir) ?? (ctx.dir.endsWith(path.join('marketing', 'tiktok')) ? path.dirname(path.dirname(ctx.dir)) : null);
    const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ctx.dir, encoding: 'utf8' });
    const main = common.status === 0 ? path.dirname(common.stdout.trim()) : null;
    const roots = new Set([repo, main].filter(Boolean).map((r) => path.dirname(r)));
    const subdirs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules').map((d) => path.join(dir, d.name)).slice(0, 400);
    const seen = new Set([fs.realpathSync(ctx.dir)]);
    const dirs = [];
    for (const root of roots) {
      if (root === home || home.startsWith(`${root}${path.sep}`) || root === path.parse(root).root) continue;
      for (const one of subdirs(root)) {
        for (const candidate of [one, ...(fs.existsSync(path.join(one, 'marketing', 'tiktok', 'studio.json')) ? [] : subdirs(one))]) {
          const studioDir = path.join(candidate, 'marketing', 'tiktok');
          if (!fs.existsSync(path.join(studioDir, 'studio.json'))) continue;
          const real = fs.realpathSync(studioDir);
          if (seen.has(real)) continue;
          seen.add(real);
          dirs.push(studioDir);
        }
      }
    }
    for (const dir of dirs) {
      try {
        const studio = readJson(path.join(dir, 'studio.json'));
        const brand = readJson(path.join(dir, 'brand', 'brand.json'), {});
        const app = studio.app ?? brand.app ?? path.basename(path.dirname(path.dirname(dir)));
        if (app === ctx.app) continue;
        const lite = { dir, app, brand, rules: ctx.rules, catalog: { music: CATALOG.axes.music } };
        const videos = loadVideos(dir);
        const added = syncPortfolio(lite, videos);
        discovered.push({ dir, app, name: brand.name ?? app, videos: videos.filter((v) => ['rendered', 'posted'].includes(v.status)).length, added });
      } catch {
        // an unreadable studio is skipped
      }
    }
  } catch {
    // discovery is best effort
  }
  return discovered;
}

function otherApps(ctx) {
  if (ctx.rules.portfolio === false) return [];
  discoverStudios(ctx);
  return loadPortfolio().filter((e) => e.app !== ctx.app);
}

// Axis values that the last few videos made here (this app and the others) keep landing on.
function overused(ctx, history, others) {
  const { overuseWindow: window, overuseCount: need, overuseAxes: axes = [] } = ctx.rules;
  const recent = [
    ...history.map((h) => ({ date: h.created ?? '', axes: h.axes ?? {}, order: 1 })),
    ...others.map((o) => ({ date: o.date ?? '', axes: o.axes ?? {}, order: 0 })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.order - b.order).slice(-window);
  const out = [];
  if (recent.length < need) return out;
  for (const axis of axes) {
    const counts = {};
    for (const r of recent) if (r.axes[axis]) counts[r.axes[axis]] = (counts[r.axes[axis]] ?? 0) + 1;
    for (const [value, count] of Object.entries(counts)) if (count >= need) out.push([axis, value, count, recent.length]);
  }
  return out;
}

// Sound -----------------------------------------------------------------------------------------
const musicEntry = (ctx, id) => ctx.catalog.music.find((m) => m.id === id) ?? null;

// The app's sonic logo: from the brand profile, or a stable one derived from the app's name.
function appMotif(ctx) {
  const given = ctx.brand.sound?.motif;
  if (Array.isArray(given) && given.length) return { degrees: given };
  if (given?.degrees?.length) return given;
  return designKit({ seed: hashSeed(`motif/${ctx.app}`) }).spec.motif;
}

// Instrument families this video may use: the music axis decides when it names one; otherwise the
// register and the brand's sonic identity narrow the field.
function soundFamilies(ctx, v) {
  const music = musicEntry(ctx, v.axes?.music);
  if (music?.family) return [music.family];
  const brandSound = ctx.brand.sound ?? {};
  const register = ctx.catalog.register?.find((r) => r.id === v.axes?.register);
  let pool = register?.families ?? FAMILY_IDS.filter((f) => f !== 'asmr');
  const avoid = brandSound.avoid ?? [];
  if (pool.some((f) => !avoid.includes(f))) pool = pool.filter((f) => !avoid.includes(f));
  const liked = pool.filter((f) => (brandSound.families ?? []).includes(f));
  return liked.length ? liked : pool;
}

function soundProblems(spec, history, rules, others = []) {
  const out = [];
  const kits = history.filter((h) => h.sound);
  const last = history[history.length - 1];
  if (last?.sound) {
    for (const field of rules.noRepeatSoundConsecutive ?? []) {
      if (spec[field] && spec[field] === last.sound[field]) out.push(`same sound ${field} "${spec[field]}" as the previous video #${last.id}`);
    }
  }
  for (const h of kits.slice(-rules.soundWindow)) {
    if (h.sound.inferred) continue;
    const d = soundDistance(spec, h.sound);
    if (d < rules.minSoundDistance) out.push(`sound differs from #${h.id} on only ${d} of ${SIGNATURE_FIELDS.length} choices (need ${rules.minSoundDistance})`);
  }
  for (const o of others.filter((x) => x.sound && !x.sound.inferred).slice(-rules.portfolioWindow)) {
    const d = soundDistance(spec, o.sound);
    if (d < rules.minPortfolioSoundDistance) out.push(`sound differs from ${o.name ?? o.app} #${o.id} (another app made here) on only ${d} of ${SIGNATURE_FIELDS.length} choices (need ${rules.minPortfolioSoundDistance})`);
  }
  return out;
}

// Design a kit for a video that passes the sound rules, trying seeds until one does.
function designSound(ctx, v, history, others, { seed, fixed = {} } = {}) {
  const families = soundFamilies(ctx, v);
  const music = musicEntry(ctx, v.axes?.music);
  const motif = appMotif(ctx);
  let best = null;
  for (let i = 0; i < 240; i += 1) {
    const s = (Number(seed) + i * 7919) >>> 0;
    const family = fixed.family ?? families[Math.floor(kitRng(s ^ 0x51ed)() * families.length)];
    const kit = designKit({ seed: s, family, ...(music?.groove ? { groove: music.groove } : {}), motif, ...fixed });
    const problems = soundProblems(kit.spec, history, ctx.rules, others);
    if (!best || problems.length < best.problems.length) best = { spec: kit.spec, problems, tries: i + 1 };
    if (!problems.length) break;
  }
  return best;
}

// Tempo, bars, scene skeleton, and sound for a set of axes: what `suggest` shows and `new` writes.
function planFor(ctx, axes, history, others, seed) {
  const sound = designSound(ctx, { axes }, history, others, { seed });
  const music = musicEntry(ctx, axes.music);
  const [lo, hi] = (music?.family && music.bpm) || FAMILIES[sound.spec.family].bpm;
  const rand = kitRng((Number(seed) ^ 0x9e3779b9) >>> 0);
  const bpm = Math.round(lo + (hi - lo) * rand());
  const barSeconds = 240 / bpm;
  const beats = ctx.catalog.format.find((f) => f.id === axes.format)?.beats ?? [];
  const target = CATALOG.axes.length.find((b) => b.id === axes.length)?.target ?? 24;
  const minBars = Math.max(1, Math.ceil(ctx.rules.minSceneSeconds / barSeconds));
  let bars = Math.max(beats.length * minBars, Math.round(target / barSeconds));
  while (bars * barSeconds >= ctx.rules.maxLength && bars > beats.length * minBars) bars -= 1;
  const scenes = planScenes(beats, bars, barSeconds, minBars);
  // The turn is the scene boundary nearest 60 percent of the way through; the final chord lands on the last scene.
  const starts = scenes.map((sc) => Math.round(sc.at / barSeconds));
  const turn = starts.slice(1).reduce((bestBar, b) => (Math.abs(b - bars * 0.6) < Math.abs(bestBar - bars * 0.6) ? b : bestBar), starts[1] ?? Math.floor(bars / 2));
  const endBar = scenes.length ? Math.min(bars - 1, starts[starts.length - 1]) : bars - 1;
  return { bpm, bars, length: r3(bars * barSeconds), scenes, sound: { ...sound.spec, turn, endBar }, soundProblems: sound.problems };
}

// Similarity ---------------------------------------------------------------------------------
// Word trigrams per string (short strings fall back to words and bigrams), unioned for a list.
function grams(input) {
  const set = new Set();
  for (const text of Array.isArray(input) ? input : [input]) {
    const words = String(text ?? '').toLowerCase().replace(/[^a-z0-9%+'\s-]/g, ' ').split(/\s+/).filter(Boolean);
    if (words.length < 3) {
      words.forEach((w) => set.add(w));
      for (let i = 1; i < words.length; i += 1) set.add(`${words[i - 1]} ${words[i]}`);
    } else {
      for (let i = 2; i < words.length; i += 1) set.add(`${words[i - 2]} ${words[i - 1]} ${words[i]}`);
    }
  }
  return set;
}

function jaccard(a, b) {
  const A = grams(a);
  const B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter += 1;
  return inter / (A.size + B.size - inter);
}

// Share of meaningful words two short lines have in common (catches a paraphrased hook).
const FILLER = new Set(['a', 'an', 'the', 'is', 'are', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'your', 'you', 'my', 'i', 'it', 'this', 'that', 'pov', 'with', 'at', 'by']);
function wordOverlap(a, b) {
  const words = (text) => new Set(String(text ?? '').toLowerCase().replace(/[^a-z0-9%+'\s-]/g, ' ').split(/\s+/).filter((w) => w && !FILLER.has(w)));
  const A = words(a);
  const B = words(b);
  if (A.size < 2 || B.size < 2) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  return inter / (A.size + B.size - inter);
}

// Brand boilerplate (name, one-liner, CTA) repeats by design and is excluded from copy overlap.
let BOILERPLATE = new Set();
const setBoilerplate = (brand) => {
  BOILERPLATE = new Set([brand.name, brand.one_liner, brand.category, brand.url, brand.cta?.url, brand.cta?.primary, brand.cta?.fineprint]
    .filter(Boolean).map((x) => String(x).trim().toLowerCase()));
};
const copyList = (v) => (Array.isArray(v.copy) ? v.copy : [v.copy ?? '']).filter((c) => !BOILERPLATE.has(String(c).trim().toLowerCase()));
const copyText = (v) => copyList(v).join(' | ');
const distance = (a, b) => AXES.filter((axis) => String(a.axes?.[axis] ?? '') !== String(b.axes?.[axis] ?? '')).length;
const triple = (v, keys) => keys.map((k) => v.axes?.[k] ?? '').join('|');

// Hard rules for a candidate (full video meta or axes-only combo) against this studio's history
// and against the videos made here for other apps.
function violations(candidate, history, ctx, { checkCopy = true, others = [], over = null, legacy = false } = {}) {
  // A video scaffolded before the newer axes existed is held to the distance and the consecutive
  // rules it was made under.
  const rules = legacy ? { ...ctx.rules, minAxisDistance: Math.min(ctx.rules.minAxisDistance, 3), noRepeatConsecutive: ['hook', 'format'] } : ctx.rules;
  const out = [];
  const recent = history.slice(-rules.window);
  for (const h of recent) {
    const d = distance(candidate, h);
    if (d < rules.minAxisDistance) out.push(`differs from #${h.id} on only ${d} axes (need ${rules.minAxisDistance})`);
  }
  const t = triple(candidate, rules.noRepeatTriple);
  const clash = history.find((h) => triple(h, rules.noRepeatTriple) === t);
  if (clash) out.push(`repeats the ${rules.noRepeatTriple.join('+')} combination of #${clash.id}`);
  const last = history[history.length - 1];
  if (last) {
    for (const axis of rules.noRepeatConsecutive) {
      const sameSeries = axis === 'format' && candidate.series && candidate.series === last.series;
      if (!sameSeries && candidate.axes?.[axis] && candidate.axes[axis] === last.axes?.[axis]) out.push(`same ${axis} as the previous video #${last.id}`);
    }
    const family = musicEntry(ctx, candidate.axes?.music)?.family;
    if (family && last.sound?.family === family) out.push(`music "${candidate.axes.music}" plays the same instrument family (${family}) as the previous video #${last.id}`);
  }
  for (const o of others.slice(-rules.portfolioWindow)) {
    const d = PORTABLE.filter((axis) => String(candidate.axes?.[axis] ?? '') !== String(o.axes?.[axis] ?? '')).length;
    if (d < rules.minPortfolioDistance) out.push(`differs from ${o.name ?? o.app} #${o.id} (another app made here) on only ${d} of ${PORTABLE.length} shared axes (need ${rules.minPortfolioDistance})`);
  }
  for (const [axis, value, count, total] of over ?? overused(ctx, history, others)) {
    if (candidate.axes?.[axis] === value) out.push(`${axis} "${value}" was used in ${count} of the last ${total} videos made here; it has become a default, so pick another`);
  }
  if (checkCopy && candidate.hook_line) {
    for (const h of history) {
      if (!h.hook_line) continue;
      if (h.hook_line.trim().toLowerCase() === candidate.hook_line.trim().toLowerCase()) out.push(`hook line is identical to #${h.id}`);
      else {
        const s = jaccard(h.hook_line, candidate.hook_line);
        const w = wordOverlap(h.hook_line, candidate.hook_line);
        if (s > rules.hookSimilarityMax) out.push(`hook line is ${(s * 100).toFixed(0)}% similar to #${h.id} ("${h.hook_line}")`);
        else if (w > (rules.hookWordSimilarityMax ?? 0.6)) out.push(`hook line reuses ${(w * 100).toFixed(0)}% of the words of #${h.id} ("${h.hook_line}"); a paraphrase is still a repeat`);
      }
    }
  }
  if (checkCopy && candidate.copy?.length) {
    for (const h of history) {
      const s = jaccard(copyList(h), copyList(candidate));
      if (s > rules.copySimilarityMax) out.push(`on-screen copy is ${(s * 100).toFixed(0)}% similar to #${h.id}`);
    }
  }
  return out;
}

function warnings(candidate, history, rules) {
  const out = [];
  const lastN = (n) => history.slice(-n);
  if (lastN(rules.featureCooldown).some((h) => h.axes?.feature === candidate.axes?.feature)) out.push(`feature "${candidate.axes?.feature}" was used in the last ${rules.featureCooldown}`);
  for (const axis of ['music', 'world']) {
    if (lastN(2).some((h) => h.axes?.[axis] === candidate.axes?.[axis])) out.push(`${axis} "${candidate.axes?.[axis]}" was used in the last 2`);
  }
  return out;
}

// Novelty and performance scoring ----------------------------------------------------------------
function noveltyOf(axis, value, history, others = []) {
  let weight = 0;
  history.forEach((h, i) => {
    if (h.axes?.[axis] === value) weight += 0.8 ** (history.length - 1 - i);
  });
  // What other apps made counts too, at half weight, for the axes that are not tied to an app.
  if (PORTABLE.includes(axis)) {
    others.forEach((o, i) => {
      if (o.axes?.[axis] === value) weight += 0.5 * 0.8 ** (others.length - 1 - i);
    });
  }
  return 1 / (1 + weight) + (weight === 0 ? 0.25 : 0);
}

// How well a combination hangs together: a format's natural partners, and music that suits the register.
function coherence(ctx, axes) {
  let score = 0;
  const fits = ctx.catalog.format.find((f) => f.id === axes.format)?.fits ?? {};
  for (const [axis, list] of Object.entries(fits)) if (list.includes(axes[axis])) score += 0.4;
  const families = ctx.catalog.register?.find((r) => r.id === axes.register)?.families;
  const family = musicEntry(ctx, axes.music)?.family;
  if (families && family) score += families.includes(family) ? 0.3 : -0.3;
  return score;
}

function performanceTable(history) {
  const scored = history.filter((h) => Number(h.performance?.views) > 0);
  if (scored.length < 5) return null;
  const logs = scored.map((h) => Math.log1p(Number(h.performance.views)));
  const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
  const sd = Math.sqrt(logs.reduce((a, b) => a + (b - mean) ** 2, 0) / logs.length) || 1;
  const table = {};
  scored.forEach((h, i) => {
    const z = (logs[i] - mean) / sd;
    for (const axis of AXES) {
      const key = `${axis}:${h.axes?.[axis]}`;
      (table[key] ??= []).push(z);
    }
  });
  return Object.fromEntries(Object.entries(table).map(([k, zs]) => [k, zs.reduce((a, b) => a + b, 0) / zs.length]));
}

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function suggest(ctx, history, { n = 6, seed = Date.now() % 100000, fixed = {}, others = [] } = {}) {
  const { values, rules, studio } = ctx;
  const over = overused(ctx, history, others);
  const rand = rngFrom(Number(seed));
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const perf = performanceTable(history);
  const defLen = lengthBucket(studio.defaults?.length ?? 24);
  const pool = [];
  for (let i = 0; i < 6000; i += 1) {
    const axes = {};
    for (const axis of AXES) {
      if (fixed[axis]) axes[axis] = fixed[axis];
      else if (axis === 'length') axes.length = rand() < 0.5 ? defLen : pick(values.length);  // buckets
      else axes[axis] = values[axis].length ? pick(values[axis]) : null;
    }
    const cand = { axes, series: fixed.series ?? null };
    if (violations(cand, history, ctx, { checkCopy: false, others, over }).length) continue;
    let novelty = 0;
    let bonus = 0;
    const why = [];
    for (const axis of AXES) {
      if (!axes[axis]) continue;
      const nv = noveltyOf(axis, axes[axis], history, others);
      novelty += CATALOG.weights[axis] * nv;
      if (nv > 1) why.push(`new ${axis}`);
      const z = perf?.[`${axis}:${axes[axis]}`];
      if (z !== undefined) {
        // Strong enough that a proven hook or format can beat an untried one in exploit slots.
        bonus += CATALOG.weights[axis] * 0.9 * z;
        if (z > 0.5) why.push(`${axis} "${axes[axis]}" performs well`);
      }
    }
    const fit = coherence(ctx, axes);
    if (fit >= 0.5) why.push('format, look, and sound suit each other');
    pool.push({ axes, novelty: novelty + fit, bonus, why });
  }
  if (!pool.length) return [];
  const exploitSlots = perf ? Math.ceil(n * (1 - rules.exploreShare)) : 0;
  const chosen = [];
  pool.forEach((c) => (c.jitter = rand() * 0.05));
  for (let slot = 0; slot < n; slot += 1) {
    const exploit = slot < exploitSlots;
    // Spread the slate: penalize values already used by earlier suggestions in this run.
    const ranked = pool
      .filter((c) => chosen.every((p) => distance(c, p) >= 5))
      .map((c) => {
        const overlap = chosen.reduce((sum, p) => sum + (AXES.length - distance(c, p)), 0);
        return { ...c, score: c.novelty + (exploit ? c.bonus : 0) - 0.35 * overlap + c.jitter };
      })
      .sort((a, b) => b.score - a.score);
    if (!ranked.length) break;
    chosen.push({ ...ranked[0], mode: exploit ? 'exploit' : 'explore' });
  }
  return chosen;
}

// Output helpers ---------------------------------------------------------------------------------
const axesLine = (a = {}) => AXES.map((k) => `${k}=${a[k] ?? '?'}`).join('  ');
const perfLine = (p) => {
  if (!p || !p.views) return '';
  const k = (x) => (x >= 1000 ? `${(x / 1000).toFixed(1)}k` : String(x));
  return `  views ${k(Number(p.views))}${p.likes ? ` likes ${k(Number(p.likes))}` : ''}${p.completion ? ` completion ${Math.round(Number(p.completion) * 100)}%` : ''}${p.avg_watch_s ? ` avg ${p.avg_watch_s}s` : ''}`;
};

function writeLedger(ctx, videos) {
  const rows = videos.map((v) => {
    const p = v.performance ?? {};
    const sound = v.sound ? `${v.sound.family} ${v.sound.shape}` : v.axes?.music ?? '';
    return `| ${v.id} | ${v.created ?? ''} | ${v.status} | ${String(v.hook_line ?? '').replace(/\|/g, '/')} | ${v.axes?.hook ?? ''} | ${v.axes?.opening ?? ''} | ${v.axes?.format ?? ''} | ${v.axes?.feature ?? ''} | ${v.axes?.register ?? ''} | ${v.axes?.world ?? ''} | ${sound} | ${v.axes?.ending ?? ''} | ${shapeOf(v)} | ${v.length ?? ''} | ${p.views ?? ''} | ${p.completion ? `${Math.round(p.completion * 100)}%` : ''} |`;
  });
  const text = [
    `# ${ctx.studio.name ?? 'TikTok studio'} ledger`,
    '',
    'Generated by `studio.mjs ledger`. Edit videos/*/meta.json, not this file.',
    '',
    '| # | Date | Status | Hook | Hook type | Opening | Format | Feature | Register | World | Sound | Ending | Shape | Len | Views | Completion |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(ctx.dir, 'LEDGER.md'), text);
}

function copyDir(src, dst, { skip = [] } = {}) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.includes(entry.name) || entry.name === '.DS_Store') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d, { skip });
    else fs.copyFileSync(s, d);
  }
}

// Building blocks ----------------------------------------------------------------------------------
const SKILL_BLOCKS = path.join(skillDir, 'blocks');
const listDirs = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : []);

function loadBlocks(ctx) {
  const blocks = new Map();
  for (const [tier, root] of [['generic', SKILL_BLOCKS], ['app', path.join(ctx.dir, 'blocks')]]) {
    for (const id of listDirs(root)) {
      const meta = readJson(path.join(root, id, 'block.json'));
      if (meta) blocks.set(id, { ...meta, tier, dir: path.join(root, id) });
    }
  }
  return blocks;
}

function loadFormats(ctx) {
  const root = path.join(ctx.dir, 'formats');
  return listDirs(root).map((id) => ({ id, dir: path.join(root, id), ...(readJson(path.join(root, id, 'format.json')) ?? {}) }));
}

function filesUnder(dir, exts = ['.mjs', '.js']) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return filesUnder(p, exts);
    return exts.includes(path.extname(d.name)) ? [p] : [];
  });
}

// Blocks a video actually imports (from src/ and soundtrack.mjs), including blocks those import.
function usedBlocks(videoDir) {
  const found = new Set();
  const scan = (file, pattern) => {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(pattern)) found.add(m[1]);
  };
  for (const f of [...filesUnder(path.join(videoDir, 'src')), path.join(videoDir, 'soundtrack.mjs')].filter((f) => fs.existsSync(f))) {
    scan(f, /blocks\/([a-z0-9][a-z0-9-]*)\//g);
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of [...found]) {
      for (const f of filesUnder(path.join(videoDir, 'blocks', id))) {
        for (const m of fs.readFileSync(f, 'utf8').matchAll(/['"]\.\.\/([a-z0-9][a-z0-9-]*)\/[^'"]+['"]/g)) {
          if (!found.has(m[1]) && fs.existsSync(path.join(videoDir, 'blocks', m[1]))) {
            found.add(m[1]);
            grew = true;
          }
        }
      }
    }
  }
  return found;
}

function dirHash(dir) {
  const files = filesUnder(dir, ['.mjs', '.js', '.json', '.css', '.md']).map((f) => path.relative(dir, f)).sort();
  return files.map((f) => `${f}:${fs.readFileSync(path.join(dir, f), 'utf8')}`).join('\n');
}

function validateBlock(bdir, meta, ctx) {
  const problems = [];
  const warns = [];
  for (const field of ['id', 'kind', 'scope', 'summary', 'usage']) if (!meta[field]) problems.push(`block.json missing ${field}`);
  if (meta.id && meta.id !== path.basename(bdir)) problems.push(`block.json id "${meta.id}" does not match folder "${path.basename(bdir)}"`);
  if (!fs.existsSync(path.join(bdir, 'index.mjs'))) problems.push('index.mjs is missing');
  for (const f of filesUnder(bdir)) {
    const r = spawnSync('node', ['--check', f], { encoding: 'utf8' });
    if (r.status !== 0) problems.push(`syntax error in ${path.basename(f)}: ${(r.stderr || '').split('\n').find((l) => /Error/.test(l)) ?? ''}`);
    const src = fs.readFileSync(f, 'utf8');
    if (/from ['"]\.\.\/\.\.\/src\//.test(src)) problems.push(`${path.basename(f)} imports video code (../../src); blocks must be self-contained`);
    if (meta.scope !== 'app') {
      const brandName = ctx.brand.name && ctx.brand.name.length > 2 ? new RegExp(`\\b${ctx.brand.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : null;
      src.split('\n').forEach((line, i) => {
        if (/^\s*\/\//.test(line)) return;
        if (brandName && brandName.test(line)) problems.push(`${path.basename(f)}:${i + 1} mentions "${ctx.brand.name}"; generic blocks take copy as params (or set scope "app")`);
        if (/#[0-9a-fA-F]{3,8}\b/.test(line) && !/tokens|#fff/i.test(line)) warns.push(`${path.basename(f)}:${i + 1} hardcodes a color; prefer CSS variables or brand tokens`);
      });
    }
  }
  return { problems, warns };
}

function writeCatalogs(ctx, videos) {
  const blocks = loadBlocks(ctx);
  const usage = {};
  for (const v of videos) for (const id of v.blocks_used ?? []) usage[id] = (usage[id] ?? 0) + 1;
  const table = (tier, withUsage) => [...blocks.values()].filter((b) => tier === 'all' || b.tier === tier).map((b) =>
    `| ${b.id}${b.signature ? ' *' : ''} | ${b.kind} | v${b.version ?? 1} |${withUsage ? ` ${usage[b.id] ?? 0} |` : ''} ${String(b.summary ?? '').replace(/\|/g, '/')} |`);
  fs.mkdirSync(SKILL_BLOCKS, { recursive: true });
  fs.writeFileSync(path.join(SKILL_BLOCKS, 'CATALOG.md'), [
    '# Generic building blocks', '', 'Shared by every studio. `*` marks signature blocks: reuse freely, but not in consecutive videos.',
    'Regenerated by `studio.mjs`; edit block.json files, not this table.', '',
    '| Block | Kind | Version | Summary |', '| --- | --- | --- | --- |', ...table('generic', false), ''].join('\n'));
  const studioBlocks = path.join(ctx.dir, 'blocks');
  fs.mkdirSync(studioBlocks, { recursive: true });
  const formats = loadFormats(ctx);
  fs.writeFileSync(path.join(studioBlocks, 'CATALOG.md'), [
    `# ${ctx.brand.name ?? 'App'} building blocks`, '', 'Every block available to this studio (generic ones live in the skill, app ones here) and how often this page has used it.', '',
    '| Block | Kind | Version | Used here | Summary |', '| --- | --- | --- | --- | --- |', ...table('all', true), '',
    '## Saved formats', '', ...(formats.length ? formats.map((f) => `- ${f.id}: from #${f.from_video ?? '?'} (${f.saved ?? ''}). Start with \`studio.mjs new --slug <slug> --format ${f.id}\`.`) : ['None yet.']), ''].join('\n'));
}

// Render a block's demo(ctx) in a throwaway project with this studio's brand (or the sample brand).
function demoBlock(ctx, blocks, id, { quiet = false } = {}) {
  const b = blocks.get(id);
  if (!b) fail(`No block "${id}"`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `block-demo-${id}-`));
  writeJson(path.join(tmp, 'studio.json'), { name: 'demo' });
  const brandSrc = fs.existsSync(path.join(ctx.dir, 'brand', 'brand.json')) && ctx.brand.name ? path.join(ctx.dir, 'brand') : path.join(skillDir, 'assets', 'sample-brand');
  copyDir(brandSrc, path.join(tmp, 'brand'));
  const proj = path.join(tmp, 'videos', 'demo');
  copyDir(path.join(skillDir, 'template'), proj, { skip: ['meta.json', 'script.md', 'soundtrack.mjs'] });
  copyDir(path.join(skillDir, 'engine', 'lib'), path.join(proj, 'lib'));
  fs.copyFileSync(path.join(skillDir, 'engine', 'render.mjs'), path.join(proj, 'render.mjs'));
  for (const blk of blocks.values()) copyDir(blk.dir, path.join(proj, 'blocks', blk.id), { skip: ['preview.png'] });
  fs.writeFileSync(path.join(proj, 'src', 'main.mjs'), `import { boot } from '../lib/boot.mjs';
import { createWorld } from '../lib/world3d.mjs';
import * as worlds from '../lib/worlds.mjs';
import * as block from '../blocks/${id}/index.mjs';

const len = block.DEMO_LEN ?? 3;
boot({
  duration: len,
  world: (canvas, ctx) => {
    const tokens = ctx.brand.tokens ?? {};
    const make = worlds[ctx.brand.world?.preset] ?? worlds.dataGrid;
    const preset = make({ paint: tokens.brand, ...(ctx.brand.world?.options ?? {}) });
    const span = preset.bounds.y1 - preset.bounds.y0;
    const fit = worlds.fitDistance(span, preset.bounds.x1 - preset.bounds.x0);
    const cam = { pitch: 60, dist: fit * 0.55, ...(block.DEMO_CAMERA ?? {}) };
    const overlay = block.demoOverlay ? block.demoOverlay(ctx) : null;
    return createWorld(canvas, {
      ...preset,
      camera: () => cam,
      colors: { bg: tokens.bg, line: tokens.accent, lineCore: tokens.accent, spot: tokens.accent, dust: tokens.ink },
      overlay: (api, t) => ({ floorSpan: span, ...(overlay ? overlay(api, t) : {}) }),
    });
  },
  scenes: [(ctx) => (block.demo ? block.demo(ctx) : { update() {} })],
});
`);
  const r = spawnSync('node', ['render.mjs', 'sheet', '--frames', '8', '--cols', '8', '--tile', '180', '--out', 'demo.png'], { cwd: proj, encoding: 'utf8', env: renderEnv });
  const log = `${r.stdout}${r.stderr}`;
  const ok = r.status === 0 && !/\[pageerror\]|\[page:error\]|\[request failed\]|\[[45]\d\d\]/.test(log);
  const produced = path.join(proj, 'out', 'demo.png');
  let out = null;
  if (ok && fs.existsSync(produced)) {
    const cacheDir = path.join(ctx.dir ?? os.tmpdir(), '.cache', 'block-demos');
    fs.mkdirSync(cacheDir, { recursive: true });
    out = path.join(cacheDir, `${id}.png`);
    fs.copyFileSync(produced, out);
    if (opts.save) fs.copyFileSync(produced, path.join(b.dir, 'preview.png'));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!quiet) console.log(ok ? `Demo sheet: ${out}` : `Demo failed:\n${log}`);
  return { ok, out, log };
}

// Seeing previous work ---------------------------------------------------------------------------
function findRender(v) {
  const out = path.join(v.dir, 'out');
  if (!fs.existsSync(out)) return null;
  const files = fs.readdirSync(out);
  const pick = files.find((f) => /-9x16\.mp4$/.test(f)) ?? files.find((f) => f === 'preview.mp4') ?? files.find((f) => f.endsWith('.mp4'));
  return pick ? path.join(out, pick) : null;
}

// A 12-frame strip of a video, kept next to its script so later runs can see what was made.
function makeSheet(v, dst = path.join(v.dir, 'sheet.jpg')) {
  const src = findRender(v);
  if (!src) return null;
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src], { encoding: 'utf8' });
  const seconds = Number(probe.stdout) || Number(v.length) || 24;
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vf', `fps=${(12 / seconds).toFixed(5)},scale=160:-2,tile=12x1`, '-frames:v', '1', '-q:v', '5', dst], { encoding: 'utf8' });
  return r.status === 0 && fs.existsSync(dst) ? dst : null;
}

// Fingerprint of the rendered soundtrack, and how close it is to earlier ones.
function audioFingerprint(v) {
  const wav = path.join(v.dir, 'out', 'soundtrack.wav');
  if (!fs.existsSync(wav)) return null;
  try {
    return fingerprint(wav);
  } catch {
    return null;
  }
}

function audioMatches(fp, history, others) {
  const out = [];
  for (const h of history) if (h.audio_fp) out.push({ who: `#${h.id}`, ...similarity(fp, h.audio_fp) });
  for (const o of others) if (o.audio_fp) out.push({ who: `${o.name ?? o.app} #${o.id}`, ...similarity(fp, o.audio_fp) });
  return out.sort((a, b) => b.score - a.score);
}

async function loadChromium() {
  for (const base of [skillDir, process.cwd()]) {
    try {
      const req = createRequire(path.join(base, 'noop.js'));
      const mod = await import(pathToFileURL(req.resolve('playwright-core')).href);
      return mod.chromium ?? mod.default.chromium;
    } catch {
      // try the next location
    }
  }
  return fail(`playwright-core not found. Run npm install in ${skillDir}.`);
}

const soundLabel = (sound) => (sound.inferred
  ? `${sound.family}${sound.shape ? ` ${sound.shape}` : ''} (from its ledger entry)`
  : `${sound.family} ${sound.shape}, ${sound.bass}/${sound.chord}/${sound.lead}`);

// What the brand profile still lacks before a video can be personal to this app. Every item is
// work for the run itself, never a question for the user; `check` refuses to pass until the list
// is empty.
function profileGaps(ctx, videos = []) {
  const b = ctx.brand;
  const gaps = [];
  const add = (id, what, how) => gaps.push({ id, what, how });
  const has = (file) => Boolean(file) && fs.existsSync(path.join(ctx.dir, 'brand', file));
  const features = b.features ?? [];
  const personas = ctx.catalog.persona;
  if (!b.name || b.name === 'App Name' || !b.one_liner || !b.tokens) add('basics', 'brand.json is still the template', 'Read the app (references/brand-profile.md) and fill name, url, category, one_liner, audience, voice, tokens, fonts, cta.');
  if (features.length < 3 || features.some((f) => f.id === 'feature-id')) add('features', `${features.filter((f) => f.id !== 'feature-id').length} real feature(s); at least 3 are needed and 5 to 12 give room to vary`, 'Add features from the landing page, routes, and onboarding, each with a proof line and a ui note.');
  if (personas.length < 2 || personas.some((x) => x.id === 'persona-id')) add('personas', 'fewer than 2 real personas; 4 to 8 give room to vary', 'Add specific viewer types with an id and a one-line desc.');
  if (b.logo?.file && !has(b.logo.file)) add('logo', `logo file ${b.logo.file} is missing`, 'Copy the real logo into brand/assets and record its size, or set "logo": null to use a wordmark. Never invent one.');
  if ((b.identity?.only_here ?? []).length < 2) add('only-here', 'identity.only_here needs at least two things a viewer can see in this product and nowhere else', 'Read the product and write them; every logline will use one.');
  if ((b.identity?.moments ?? []).length < 2) add('moments', 'identity.moments needs at least two moments when a real person reaches for the app', 'Write them from the app\'s own copy and use cases; also fill identity.motifs and identity.anti.');
  const looks = ctx.catalog.world.filter((x) => x.app);
  if (looks.length < 2) add('looks', `${looks.length} look(s) of its own; at least 2 are needed (3 to 6 is better)`, 'Add looks that come from the product under axes.add.world, each { id, how }, and remove the shared ones that are wrong for it under axes.remove.world.');
  const formats = ctx.catalog.format.filter((x) => x.app);
  if (!formats.length) add('formats', 'no format of its own', 'Add one to four story shapes only this product can tell under axes.add.format, each with beats: [{ id, share }] whose shares sum to 1.');
  for (const f of formats) {
    const sum = (f.beats ?? []).reduce((t, x) => t + Number(x.share ?? 0), 0);
    if ((f.beats ?? []).length < 3 || Math.abs(sum - 1) > 0.03) add(`format-${f.id}`, `format "${f.id}" needs at least 3 beats whose shares sum to 1 (they sum to ${r3(sum)})`, 'Fix its beats in brand.json axes.add.format.');
  }
  if (!(b.sound?.families ?? []).length && !(b.sound?.avoid ?? []).length) add('sound', 'no sonic identity', 'Set sound.families (instrument families that suit the brand) and sound.avoid in brand.json, and remove registers that are wrong for it under axes.remove.register. See references/sound-design.md for the families.');
  const screens = (b.surfaces ?? []).filter((x) => has(x.file));
  if (!screens.length && !b.surfaces_unavailable) add('screens', 'no real product screens', 'Capture three or more screens and states: `studio capture --url <brand url or a local dev server page> --name <id>`. Reuse screenshots already in the repository (README, store listing, docs) by copying them into brand/assets/screens and listing them in surfaces. Only if the product cannot be reached at all, set "surfaces_unavailable": "<why>" in brand.json and mirror the real components faithfully.');
  if (!has('style_guide.md')) add('style-guide', 'brand/style_guide.md is not written', 'Write it from the captured screens and the app\'s own site or marketing: palette (hex), type, spacing, texture, shot lengths, and how things enter and leave. `studio refs <video>` measures a reference video.');
  const unlabeled = videos.filter((v) => countable(v) && !modern(v) && (!v.axes?.opening || !v.axes?.register || !v.look?.name)).map((v) => `#${v.id}`);
  if (unlabeled.length) add('older-videos', `${unlabeled.join(', ')} ${unlabeled.length === 1 ? 'predates' : 'predate'} the opening, register, and look fields`, `Read each one's script.md and sheet.jpg and add axes.opening, axes.register, and look.name to its meta.json (studio axes --how opening lists the values), so the next video is compared with what they really were.`);
  return gaps;
}

// Bring finished videos made by an older version of the skill up to date with what can be
// measured: a strip of frames and a fingerprint of the soundtrack. Adds fields only.
function upgradeVideos(videos) {
  const done = [];
  for (const v of videos.filter((x) => ['rendered', 'posted'].includes(x.status))) {
    const added = [];
    if (!fs.existsSync(path.join(v.dir, 'sheet.jpg')) && makeSheet(v)) added.push('strip');
    if (!v.audio_fp) {
      const fp = audioFingerprint(v);
      if (fp) {
        const file = path.join(v.dir, 'meta.json');
        writeJson(file, { ...readJson(file), audio_fp: fp });
        v.audio_fp = fp;
        added.push('soundtrack fingerprint');
      }
    }
    if (added.length) done.push(`#${v.id} ${added.join(' and ')}`);
  }
  return done;
}

// Renders run from a video folder find the skill's playwright-core through this hint, wherever
// the skill is installed.
function writeSkillHint(dir) {
  try {
    const file = path.join(dir, '.cache', 'skill-home');
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').trim() === skillDir) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${skillDir}\n`);
  } catch {
    // a hint only
  }
}

// Why a video may not be called finished yet, or null.
function reviewProblem(v, rules) {
  const rounds = v.review?.rounds ?? [];
  if (rounds.length < rules.reviewMinRounds) return `${rounds.length} review round(s) recorded and ${rules.reviewMinRounds} are required (studio review ${v.id} --scores ...)`;
  const low = Object.entries(rounds[rounds.length - 1].scores ?? {}).filter(([, n]) => Number(n) < rules.reviewMinScore);
  return low.length ? `the last review still scores ${low.map(([k, n]) => `${k} ${n}`).join(', ')} (every score needs ${rules.reviewMinScore} or more)` : null;
}

const pairs = (text) => Object.fromEntries(String(text ?? '').split(',').filter(Boolean).map((pair) => pair.split('=').map((x) => x.trim())));

// Commands ---------------------------------------------------------------------------------------
const commands = {
  help() {
    console.log(`studio.mjs <command> [--studio <dir>]

  doctor [--fix]                 check node, ffmpeg, Chrome, and playwright-core (--fix installs it)
  init --app <slug> --name <App> create a studio (default <repo>/marketing/tiktok)
  status                         counts and in-progress work; also upgrades older videos, finds the
                                 other studios on this machine, and lists what to do now
  profile                        what the brand profile still lacks, and how to close each gap
  history [--last 12]            previous videos here, and what other apps made on this machine
  axes                           usage per axis value and what has never been tried
  suggest [--n 6] [--seed N] [--fix axis=value,...] [--series name]
                                 ranked combinations that pass the rules, each with a scene
                                 skeleton, a tempo, and a sound kit
  new --slug <slug> [--title ""] [--pick i --seed N | --axes a=b,...] [--format saved-id]
                                 scaffold videos/NNN-slug; --pick takes suggestion i of that seed
  sound <id> [--reroll] [--seed N] [--set family=..,shape=..,key=..,lead=..]
                                 design this video's sound kit so it differs from recent ones
  check <id>                     validate a video against the variation, pace, and sound rules
  review <id> --scores hook=8,read=9,motion=8,variety=7,composition=8,brand=9,sync=8,distinct=8
              --problems "0:04 ...; 0:12 ...; 0:20 ..."
                                 record one critique round (two rounds, every score 8+, to finish)
  sheet <id>                     save a 12-frame strip of the render as videos/NNN-slug/sheet.jpg
  gallery [--last 6] [--others 3]
                                 one image of recent videos here and for other apps, to look at
  log <id> [--status s] [--views n --likes n --comments n --shares n --saves n
           --watch seconds --completion 0-1 --url u --posted-at date] [--note ""]
  ledger                         regenerate LEDGER.md
  backlog add "<idea>" [--fix axis=value] | backlog list | backlog use <n> --by <id>

  capture --url <url> [--name id] [--desktop] [--full] [--selector css] [--wait ms] [--dark]
                                 screenshot a real product screen into brand/assets/screens
  refs [<video or image>] [--name id]
                                 contact sheet and shot lengths of a reference, for the style guide
  portfolio [list | add <studio dir> | forget <app>]
                                 videos made on this machine across apps (kept up to date by
                                 status; add is only for a studio outside the usual places)

  blocks [--kind k]              the building-block catalog (generic + this app) and saved formats
  blocks show <id>               a block's params and usage
  blocks demo <id> [--save]      render a contact sheet of a block's demo (--save stores preview.png)
  harvest <id> [--format] [--dry-run]
                                 promote new or improved blocks from a finished video into the
                                 library; --format also saves the video as a reusable format
  learn "<lesson>" [--scope app|engine] [--video id]
                                 append a lesson to LEARNINGS.md (studio) or the skill's LEARNINGS.md
  selftest [--blocks] [--keep]   scaffold and render the template (and every block demo) in a temp
                                 studio; run after changing the engine or blocks`);
  },

  doctor() {
    const checks = [];
    const major = Number(process.versions.node.split('.')[0]);
    checks.push([major >= 18, `node ${process.versions.node} (need 18+)`]);
    for (const bin of ['ffmpeg', 'ffprobe']) {
      const r = spawnSync(bin, ['-version'], { encoding: 'utf8' });
      checks.push([r.status === 0, `${bin} ${r.status === 0 ? r.stdout.split('\n')[0].split(' ').slice(0, 3).join(' ') : 'missing (brew install ffmpeg)'}`]);
    }
    const chrome = process.env.CHROME_PATH ?? (os.platform() === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
    checks.push([fs.existsSync(chrome), `Chrome at ${chrome}${fs.existsSync(chrome) ? '' : ' (install Chrome or set CHROME_PATH)'}`]);
    let pw = fs.existsSync(path.join(skillDir, 'node_modules', 'playwright-core'));
    if (!pw && opts.fix) {
      // The skill's own pinned dependency: install it rather than asking anyone to.
      const lock = fs.existsSync(path.join(skillDir, 'package-lock.json'));
      const r = spawnSync('npm', [lock ? 'ci' : 'install', '--no-audit', '--no-fund'], { cwd: skillDir, encoding: 'utf8' });
      pw = r.status === 0 && fs.existsSync(path.join(skillDir, 'node_modules', 'playwright-core'));
      console.log(pw ? 'fixed playwright-core installed' : `npm could not install playwright-core:\n${r.stderr}`);
    }
    checks.push([pw, pw ? 'playwright-core installed in the skill' : `playwright-core missing: run \`studio doctor --fix\` (npm install in ${skillDir})`]);
    for (const [ok, msg] of checks) console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
    if (checks.some(([ok]) => !ok)) process.exit(1);
  },

  init() {
    const root = opts.studio ? path.resolve(opts.studio) : path.join(gitRoot(process.cwd()) ?? process.cwd(), 'marketing', 'tiktok');
    const app = opts.app ?? path.basename(gitRoot(process.cwd()) ?? process.cwd()).toLowerCase();
    for (const d of [path.join(root, 'brand', 'assets', 'screens'), path.join(root, 'brand', 'refs'), path.join(root, 'videos'), path.join(root, 'blocks'), path.join(root, 'formats')]) {
      fs.mkdirSync(d, { recursive: true });
    }
    if (!fs.existsSync(path.join(root, 'LEARNINGS.md'))) {
      fs.writeFileSync(path.join(root, 'LEARNINGS.md'), '# Learnings\n\nApp-specific lessons from previous runs. Read before building; add with `studio.mjs learn`.\n\n');
    }
    const studioFile = path.join(root, 'studio.json');
    if (!fs.existsSync(studioFile)) {
      writeJson(studioFile, {
        name: `${opts.name ?? app} TikTok`,
        handle: opts.handle ?? '',
        app,
        audience: '',
        personas: [],
        series: [],
        defaults: { length: 24, aspect: '9x16' },
        axes: { add: {}, remove: {} },
        rules: {},
        created: today(),
      });
    }
    const brandFile = path.join(root, 'brand', 'brand.json');
    if (!fs.existsSync(brandFile)) {
      fs.copyFileSync(path.join(skillDir, 'assets', 'brand.template.json'), brandFile);
    }
    if (!fs.existsSync(path.join(root, 'backlog.json'))) writeJson(path.join(root, 'backlog.json'), []);
    if (!fs.existsSync(path.join(root, '.gitignore'))) fs.writeFileSync(path.join(root, '.gitignore'), 'videos/*/out/\nvideos/*/node_modules/\n.cache/\n');
    writeLedger(loadStudio(root), loadVideos(root));
    writeCatalogs(loadStudio(root), loadVideos(root));
    writeSkillHint(root);
    console.log(`Studio ready at ${root}\nNext: fill brand/brand.json (see references/brand-profile.md): tokens, fonts, logo, features, personas, real screens (studio capture), the app's own looks and formats (axes.add), and its sonic identity.`);
  },

  status() {
    const ctx = loadStudio(requireStudio());
    const videos = loadVideos(ctx.dir);
    const by = Object.fromEntries(STATUSES.map((s) => [s, videos.filter((v) => v.status === s).length]));
    const open = videos.filter((v) => ['scripting', 'building'].includes(v.status));
    const backlog = readJson(path.join(ctx.dir, 'backlog.json'), []).filter((b) => b.status !== 'used');
    console.log(`Studio: ${ctx.studio.name} (${ctx.dir})`);
    console.log(`Brand: ${ctx.brand.name ?? 'MISSING brand.json name'}  features: ${ctx.values.feature.length}  personas: ${ctx.values.persona.length}`);
    console.log(`Videos: ${videos.length}  ${Object.entries(by).filter(([, c]) => c).map(([s, c]) => `${s} ${c}`).join('  ')}`);
    console.log(`Backlog: ${backlog.length} open idea(s)`);
    const blocks = [...loadBlocks(ctx).values()];
    const lines = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.startsWith('- ')).length : 0);
    console.log(`Blocks: ${blocks.filter((b) => b.tier === 'generic').length} generic, ${blocks.filter((b) => b.tier === 'app').length} app; formats: ${loadFormats(ctx).map((f) => f.id).join(', ') || 'none'}`);
    console.log(`Learnings: ${lines(path.join(ctx.dir, 'LEARNINGS.md'))} app, ${lines(path.join(skillDir, 'LEARNINGS.md'))} engine`);
    if (open.length) console.log(`IN PROGRESS (resume before starting new work): ${open.map((v) => `#${v.id} ${v.slug} [${v.status}]`).join(', ')}`);
    // Housekeeping every run does for itself, so nobody has to: bring older videos up to date,
    // record this studio, and find the others on this machine.
    writeSkillHint(ctx.dir);
    const upgraded = upgradeVideos(videos);
    if (upgraded.length) console.log(`Upgraded older videos: ${upgraded.join('; ')}`);
    writeLedger(ctx, videos);
    syncPortfolio(ctx, videos);
    const found = discoverStudios(ctx);
    const others = otherApps(ctx);
    if (found.length) console.log(`Other studios found on this machine: ${found.map((f) => `${f.name} (${f.videos} finished)`).join(', ')}`);
    if (others.length) console.log(`Portfolio: ${others.length} video(s) for ${new Set(others.map((o) => o.app)).size} other app(s) count against repeats (\`studio history\` shows them).`);
    // What the brand profile gives this app that no other app has.
    const b = ctx.brand;
    const has = (file) => Boolean(file) && fs.existsSync(path.join(ctx.dir, 'brand', file));
    const screens = (b.surfaces ?? []).filter((x) => has(x.file));
    const refsDir = path.join(ctx.dir, 'brand', 'refs');
    const refs = fs.existsSync(refsDir) ? fs.readdirSync(refsDir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)) : [];
    const own = AXES.filter((x) => !['feature', 'persona'].includes(x)).flatMap((x) => ctx.catalog[x].filter((e) => e.app).map((e) => `${x}:${e.id}`));
    console.log(`Brand assets: logo ${b.logo?.file ? (has(b.logo.file) ? 'ok' : 'FILE MISSING') : 'none (wordmark)'}, icon ${has(b.icon?.file) ? 'ok' : 'none'}, real screens ${screens.length}, references ${refs.length}, style guide ${has('style_guide.md') ? 'ok' : 'none'}`);
    console.log(`App-specific catalog: ${own.length ? own.join(', ') : 'none'}`);
    console.log(`Sonic identity: ${b.sound?.motif ? 'motif set' : `motif derived from the app name (degrees ${appMotif(ctx).degrees.join(' ')})`}${b.sound?.families?.length ? `, families ${b.sound.families.join(', ')}` : ''}${b.sound?.avoid?.length ? `, avoids ${b.sound.avoid.join(', ')}` : ''}`);
    const gaps = profileGaps(ctx, videos);
    if (gaps.length) {
      console.log(`\nDO NOW, before choosing a video (${gaps.length}). These are this run's work, not questions for the user; \`studio check\` fails until they are done:`);
      gaps.forEach((g, i) => console.log(`  ${i + 1}. ${g.what}\n     ${g.how}`));
    } else {
      console.log('Brand profile: complete.');
    }
  },

  profile() {
    const ctx = loadStudio(requireStudio());
    const gaps = profileGaps(ctx, loadVideos(ctx.dir));
    if (!gaps.length) return console.log(`Brand profile for ${ctx.brand.name ?? ctx.app}: complete.`);
    console.log(`Brand profile for ${ctx.brand.name ?? ctx.app}: ${gaps.length} thing(s) to do now. Do them yourself from the app and its repository; do not ask the user.`);
    gaps.forEach((g, i) => console.log(`${i + 1}. [${g.id}] ${g.what}\n   ${g.how}`));
    process.exit(1);
  },

  history() {
    const ctx = loadStudio(requireStudio());
    const videos = loadVideos(ctx.dir);
    const last = Number(opts.last ?? 12);
    const shown = videos.slice(-last);
    if (!shown.length) return console.log('No videos yet. Anything goes, but still pick deliberately from the catalog.');
    for (const v of shown) {
      console.log(`#${v.id} ${v.slug} [${v.status}] ${v.created ?? ''}${perfLine(v.performance)}`);
      console.log(`  hook: "${v.hook_line ?? ''}"${v.series ? `  series: ${v.series}` : ''}`);
      console.log(`  ${axesLine(v.axes)}`);
      console.log(`  structure: ${v.scenes?.length ?? 0} scenes ${shapeOf(v) || '?'} (${(v.scenes ?? []).map((sc) => sc.id).join(' > ')})`);
      if (v.sound) console.log(`  sound: ${v.sound.family} ${v.sound.shape}, ${v.sound.keyName ?? ''} ${v.sound.mode ?? ''}, bass ${v.sound.bass}, chords ${v.sound.chord}, lead ${v.sound.lead}, groove ${v.sound.groove}`);
      else console.log(`  sound: ${v.axes?.music ?? '?'} (made before sound kits; its bed was ${(v.blocks_used ?? v.blocks_planned ?? []).filter((x) => x.startsWith('arrangement')).join(', ') || 'unknown'})`);
      if (v.look?.name) console.log(`  look: ${v.look.name}`);
      if (v.new_moves?.length) console.log(`  new moves: ${v.new_moves.join('; ')}`);
      console.log(`  blocks: ${(v.blocks_used ?? v.blocks_planned ?? []).join(', ') || 'none recorded'}`);
      const copy = copyText(v);
      console.log(`  copy: ${copy.length > 260 ? `${copy.slice(0, 257)}...` : copy}`);
      console.log(`  script: ${path.relative(process.cwd(), path.join(v.dir, 'script.md'))}`);
    }
    const hooks = videos.filter(countable).map((v) => `#${v.id} "${v.hook_line}"`);
    console.log(`\nAll hook lines so far (never reuse or paraphrase closely):\n  ${hooks.join('\n  ')}`);
    const recency = ctx.values.feature.map((f) => {
      const idx = [...videos].reverse().findIndex((v) => v.axes?.feature === f);
      return `${f}${idx < 0 ? ' (never)' : ` (${idx} videos ago)`}`;
    });
    console.log(`\nFeatures by recency: ${recency.join(', ')}`);
    const others = otherApps(ctx);
    if (others.length) {
      console.log('\nMade on this machine for other apps (a viewer never sees these, but a new video must not rhyme with them):');
      for (const o of others.slice(-6)) {
        console.log(`  ${o.name ?? o.app} #${o.id} ${o.date}  "${o.hook_line}"`);
        console.log(`    ${PORTABLE.map((k) => `${k}=${o.axes?.[k] ?? '?'}`).join('  ')}`);
        console.log(`    structure ${o.shape || '?'}${o.sound ? `  sound ${soundLabel(o.sound)}` : ''}${o.look ? `  look ${o.look}` : ''}`);
      }
    }
    const over = overused(ctx, videos.filter(countable), others);
    if (over.length) console.log(`\nDefaults to break (used in most of the last ${ctx.rules.overuseWindow} videos made here): ${over.map(([axis, value, count]) => `${axis}=${value} x${count}`).join(', ')}`);
    syncPortfolio(ctx, videos);
  },

  axes() {
    const ctx = loadStudio(requireStudio());
    const history = loadVideos(ctx.dir).filter(countable);
    for (const axis of AXES) {
      const parts = ctx.catalog[axis].map((entry) => {
        const uses = history.filter((h) => h.axes?.[axis] === entry.id);
        const name = `${entry.id}${entry.app ? ' (app)' : ''}`;
        return uses.length ? `${name} x${uses.length} (last #${uses[uses.length - 1].id})` : `${name} ·new`;
      });
      console.log(`${axis}: ${parts.join(', ') || '(no values: fill brand.json / studio.json)'}`);
    }
    console.log('\n(app) marks values this app added in brand.json or studio.json axes.add. `studio axes --how <axis>` explains each value.');
    if (opts.how && ctx.catalog[opts.how]) for (const entry of ctx.catalog[opts.how]) console.log(`  ${entry.id}: ${entry.how ?? ''}`);
  },

  suggest() {
    const ctx = loadStudio(requireStudio());
    const history = withSound(ctx, loadVideos(ctx.dir).filter(countable));
    const others = otherApps(ctx);
    // Suggestions drawn from an unfinished profile would come from a catalog no different from
    // any other app's, so the profile comes first.
    const gaps = profileGaps(ctx, loadVideos(ctx.dir));
    if (gaps.length && !opts.anyway) fail(`The brand profile has ${gaps.length} gap(s) (${gaps.map((g) => g.id).join(', ')}). Close them first, without asking the user: \`studio profile\` says how.`);
    const fixed = pairs(opts.fix);
    if (opts.series) fixed.series = opts.series;
    const seed = Number(opts.seed ?? Date.now() % 100000);
    const list = suggest(ctx, history, { n: Number(opts.n ?? 6), seed, fixed, others });
    if (!list.length) fail('No combination passes the rules. Loosen studio.json rules, add brand features, or add app-specific axis values.');
    list.forEach((c, i) => {
      const plan = planFor(ctx, c.axes, history, others, seed + i * 101);
      c.plan = plan;
      // A format with many beats may need more time than the length bucket that was drawn.
      c.axes.length = lengthBucket(plan.length);
      console.log(`${i + 1}. [${c.mode}] score ${(c.novelty + (c.mode === 'exploit' ? c.bonus : 0)).toFixed(2)}  ${axesLine(c.axes)}`);
      if (c.why.length) console.log(`   ${[...new Set(c.why)].slice(0, 5).join('; ')}`);
      console.log(`   structure: ${plan.scenes.map((sc) => `${sc.id} ${sc.bars} bar${sc.bars > 1 ? 's' : ''}`).join(' > ')}  (${plan.bars} bars @ ${plan.bpm} BPM = ${plan.length}s)`);
      console.log(`   sound: ${plan.sound.family} ${plan.sound.shape} in ${plan.sound.keyName} ${plan.sound.mode}; bass ${plan.sound.bass}, chords ${plan.sound.chord}, lead ${plan.sound.lead}, groove ${plan.sound.groove}; impact ${plan.sound.impact}, moves ${plan.sound.whoosh}, ticks ${plan.sound.tick}`);
    });
    console.log(`\nSeed ${seed}. Scaffold one as it stands: studio new --slug <slug> --pick <number> --seed ${seed}${opts.fix ? ` --fix ${opts.fix}` : ''}${opts.series ? ` --series ${opts.series}` : ''}`);
    console.log('A suggestion is a starting point: change any axis for the concept, then `studio sound <id>` and `studio check <id>`.');
    const over = overused(ctx, history, others);
    if (over.length) console.log(`Defaults already excluded: ${over.map(([axis, value]) => `${axis}=${value}`).join(', ')}`);
    const backlog = readJson(path.join(ctx.dir, 'backlog.json'), []).map((b, i) => ({ ...b, i })).filter((b) => b.status !== 'used');
    if (backlog.length) console.log(`\nOpen backlog ideas (prefer these when they fit): ${backlog.map((b) => `[${b.i}] ${b.idea}`).join(' | ')}`);
    if (opts.json) console.log(JSON.stringify(list, null, 2));
  },

  new() {
    const ctx = loadStudio(requireStudio());
    const slug = String(opts.slug ?? opts._[0] ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) fail('Pass --slug <short-kebab-name>.');
    const videos = loadVideos(ctx.dir);
    const id = String(videos.reduce((m, v) => Math.max(m, Number(v.id) || 0), 0) + 1).padStart(3, '0');
    const dir = path.join(ctx.dir, 'videos', `${id}-${slug}`);
    if (fs.existsSync(dir)) fail(`${dir} already exists`);
    copyDir(path.join(skillDir, 'template'), dir, { skip: ['meta.json', 'script.md'] });
    copyDir(path.join(skillDir, 'engine', 'lib'), path.join(dir, 'lib'));
    for (const f of ['render.mjs', 'build.mjs', 'analyze-audio.mjs', 'beats.mjs']) fs.copyFileSync(path.join(skillDir, 'engine', f), path.join(dir, f));
    // Every video carries a snapshot of the whole block library (generic, then app blocks on top).
    for (const b of loadBlocks(ctx).values()) copyDir(b.dir, path.join(dir, 'blocks', b.id), { skip: ['preview.png'] });
    let startedFrom = null;
    if (opts.format) {
      const fmt = loadFormats(ctx).find((f) => f.id === opts.format);
      if (!fmt) fail(`No saved format "${opts.format}". Saved: ${loadFormats(ctx).map((f) => f.id).join(', ') || 'none'}`);
      copyDir(path.join(fmt.dir, 'src'), path.join(dir, 'src'));
      if (fs.existsSync(path.join(fmt.dir, 'soundtrack.mjs'))) fs.copyFileSync(path.join(fmt.dir, 'soundtrack.mjs'), path.join(dir, 'soundtrack.mjs'));
      startedFrom = { format: fmt.id, video: fmt.from_video ?? null };
    }
    const meta = readJson(path.join(skillDir, 'template', 'meta.json'));
    Object.assign(meta, { id, slug, app: ctx.studio.app ?? ctx.brand.app, title: opts.title ?? slug.replace(/-/g, ' '), created: today(), status: 'scripting', started_from: startedFrom });
    // Axes from a suggestion (--pick with the --seed that suggest printed) or given directly (--axes).
    const history = withSound(ctx, videos.filter(countable));
    const others = otherApps(ctx);
    let chosen = null;
    let planSeed = hashSeed(`${ctx.app}/${id}/${slug}`);
    if (opts.pick) {
      if (opts.seed === undefined) fail('--pick needs the --seed that `studio suggest` printed.');
      const fixed = pairs(opts.fix);
      if (opts.series) fixed.series = opts.series;
      const list = suggest(ctx, history, { n: Number(opts.n ?? 6), seed: Number(opts.seed), fixed, others });
      const i = Number(opts.pick) - 1;
      if (!list[i]) fail(`Suggestion ${opts.pick} does not exist for seed ${opts.seed}. The history may have changed; run suggest again.`);
      chosen = list[i].axes;
      planSeed = Number(opts.seed) + i * 101;
    } else if (opts.axes) {
      chosen = pairs(opts.axes);
      for (const [axis, value] of Object.entries(chosen)) {
        if (!AXES.includes(axis)) fail(`Unknown axis "${axis}". Axes: ${AXES.join(', ')}`);
        if (ctx.values[axis].length && !ctx.values[axis].includes(value)) fail(`${axis}="${value}" is not in this studio's catalog (studio axes --how ${axis}).`);
      }
    }
    let plan = null;
    if (chosen) {
      meta.axes = { ...meta.axes, ...chosen };
      if (opts.series) meta.series = opts.series;
      if (chosen.format && chosen.music) {
        plan = planFor(ctx, meta.axes, history, others, planSeed);
        Object.assign(meta, { bpm: plan.bpm, bars: plan.bars, length: plan.length, scenes: plan.scenes.map(({ bars, ...scene }) => scene), sound: plan.sound });
        // The picture side learns the groove and shape; the scaffold's grid and cues stay until the script replaces them.
        const cuesFile = path.join(dir, 'src', 'cues.mjs');
        if (fs.existsSync(cuesFile)) {
          const src = fs.readFileSync(cuesFile, 'utf8');
          fs.writeFileSync(cuesFile, src.replace(/(export const SOUND = \{ groove: ')[^']*(', shape: ')[^']*(')/, `$1${plan.sound.groove}$2${plan.sound.shape}$3`));
        }
      }
    }
    meta.axes = { ...meta.axes, length: lengthBucket(meta.length) };
    writeJson(path.join(dir, 'meta.json'), meta);
    const script = fs.readFileSync(path.join(skillDir, 'template', 'script.md'), 'utf8')
      .replaceAll('{{id}}', id).replaceAll('{{title}}', meta.title).replaceAll('{{date}}', meta.created).replaceAll('{{app}}', ctx.brand.name ?? meta.app ?? '');
    fs.writeFileSync(path.join(dir, 'script.md'), script);
    fs.writeFileSync(path.join(dir, '.gitignore'), 'out/\n');
    writeSkillHint(ctx.dir);
    writeLedger(ctx, loadVideos(ctx.dir));
    console.log(`Scaffolded #${id} at ${dir}`);
    if (plan) {
      console.log(`Axes: ${axesLine(meta.axes)}`);
      console.log(`Structure to write (from the ${meta.axes.format} format, ${plan.bars} bars @ ${plan.bpm} BPM = ${plan.length}s): ${plan.scenes.map((sc) => `${sc.id} ${sc.at}-${sc.out}s`).join(' > ')}`);
      console.log(`Sound kit:\n  ${describeKit(plan.sound).join('\n  ')}`);
      console.log(`  the story turns at bar ${plan.sound.turn}; the final chord lands on bar ${plan.sound.endBar}`);
      console.log('The scaffold source still plays its own 24 s demo: rewrite src/cues.mjs (grid, cues, SOUND turn and endBar), src/copy.mjs, src/world.mjs, and src/scenes.mjs to this structure.');
    } else {
      console.log('No axes chosen yet: fill meta.json axes and scenes, then run `studio sound` to design the sound kit.');
    }
    if (startedFrom) console.log(`Started from the saved "${startedFrom.format}" format (#${startedFrom.video}). Keep its mechanics; replace the copy, world treatment, and signature move.`);
    const blocks = [...loadBlocks(ctx).values()];
    console.log(`Blocks available in ${path.join(dir, 'blocks')} (${blocks.length}): ${blocks.map((b) => `${b.id}${b.signature ? '*' : ''}`).join(', ')}`);
    console.log('Run `studio.mjs blocks` for summaries. Build new reusable pieces as blocks, not inline scene code.');
  },

  check() {
    const ctx = loadStudio(requireStudio());
    const { rules } = ctx;
    const videos = loadVideos(ctx.dir);
    const id = String(opts._[0] ?? '').padStart(3, '0');
    const v = videos.find((x) => x.id === id);
    if (!v) fail(`No video #${id}`);
    const history = withSound(ctx, videos.filter((x) => x.id !== v.id && countable(x) && x.id < v.id));
    const isModern = modern(v);
    // Videos made before the portfolio existed are not judged against other apps after the fact.
    const others = isModern ? otherApps(ctx).filter((o) => String(o.date ?? '') <= String(v.created ?? today())) : [];
    const prev = history[history.length - 1];
    const built = ['building', 'rendered', 'posted'].includes(v.status);
    const errors = [];
    const warns = [];
    const notes = [];
    for (const field of ['hook_line', 'scenes', 'length', 'bpm', 'bars']) {
      if (v[field] === undefined || v[field] === null || v[field] === '' || (Array.isArray(v[field]) && !v[field].length)) errors.push(`meta.json is missing ${field}`);
    }
    for (const axis of AXES) {
      const value = v.axes?.[axis];
      if (!value) {
        if (isModern || !['opening', 'register'].includes(axis)) errors.push(`axes.${axis} is empty`);
      } else if (ctx.values[axis].length && !ctx.values[axis].includes(String(value))) {
        errors.push(`axes.${axis}="${value}" is not in the catalog (add it to brand.json/studio.json or pick a listed value)`);
      }
    }
    if (v.bpm && v.bars && v.length && Math.abs((v.bars * 240) / v.bpm - v.length) > 0.06) {
      errors.push(`bars x 240 / bpm = ${((v.bars * 240) / v.bpm).toFixed(2)}s, not the ${v.length}s length`);
    }
    if (v.length && v.axes?.length !== lengthBucket(v.length)) errors.push(`axes.length is "${v.axes?.length}" but a ${v.length}s video belongs in "${lengthBucket(v.length)}"`);
    // Comprehension comes before brevity: under the length ceiling, with time to read every scene.
    if (Number(v.length) >= rules.maxLength) errors.push(`length ${v.length}s: every video stays under ${rules.maxLength}s`);
    // The reading budget counts what scenes say the viewer must read, not every UI label.
    const mustRead = Array.isArray(v.scenes) && v.scenes.length ? v.scenes.flatMap((sc) => sc.copy ?? []) : v.copy ?? [];
    const words = countWords(mustRead);
    const wps = v.length ? words / Number(v.length) : 0;
    if (wps > rules.maxWordsPerSecond) errors.push(`${words} words to read in ${v.length}s is ${wps.toFixed(1)} words/s; cut copy or give the video more time (under ${rules.maxLength}s)`);
    const pace = paceProblems(v, rules);
    errors.push(...pace.errors);
    warns.push(...pace.warns);
    const banned = ctx.brand.voice?.banned ?? [];
    for (const token of banned) if (copyText(v).includes(token)) errors.push(`copy contains banned text "${token}" (brand voice rules)`);
    errors.push(...violations(v, history, ctx, { others, legacy: !isModern }));
    warns.push(...warnings(v, history, rules));
    if (wps > rules.warnWordsPerSecond && wps <= rules.maxWordsPerSecond) warns.push(`copy runs ${wps.toFixed(1)} words/s; make sure every line holds still long enough to read`);

    // A thin brand profile is why two apps' videos look alike, so it has to be complete first.
    if (isModern) {
      const gaps = profileGaps(ctx, videos);
      if (gaps.length) errors.push(`the brand profile has ${gaps.length} gap(s) (${gaps.map((g) => g.id).join(', ')}). Close them now, without asking the user: \`studio profile\` says how`);
    }

    // Structure: the scaffold is not a video, and two videos in a row may not share a rhythm.
    const scaffold = CATALOG.scaffold ?? {};
    const sceneIds = (v.scenes ?? []).map((sc) => sc.id);
    if (sceneIds.length && sceneIds.join('|') === (scaffold.sceneIds ?? []).join('|')) {
      errors.push("the scene list is the scaffold's (hook, three features, payoff, end card). Write this video's own structure from its format");
    }
    const shape = shapeOf(v);
    if (prev && shape.length >= 3 && shape === shapeOf(prev)) {
      errors.push(`same scene rhythm (${shape}) as the previous video #${prev.id}: change how many scenes there are or how long each runs`);
    } else {
      const twin = history.slice(-rules.window).find((h) => shape.length >= 3 && shapeOf(h) === shape);
      if (twin) warns.push(`scene rhythm ${shape} matches #${twin.id}`);
    }
    if (shape.length >= 4 && new Set((v.scenes ?? []).map((sc) => r3(sc.out - sc.at))).size === 1) warns.push('every scene is the same length; vary the rhythm (one long hold, one quick pair)');

    // Blocks: reuse mechanics, never the whole look.
    const blocks = loadBlocks(ctx);
    const visual = (list) => (list ?? []).filter((b) => blocks.get(b)?.kind !== 'sound' && !b.startsWith('arrangement-'));
    const mine = visual(v.blocks_used ?? v.blocks_planned);
    if ((scaffold.blocks ?? []).length && scaffold.blocks.every((b) => mine.includes(b))) {
      errors.push(`blocks ${scaffold.blocks.join(', ')} together are the scaffold's video; build this concept's own scenes`);
    }
    if (prev) {
      const theirs = visual(prev.blocks_used ?? prev.blocks_planned);
      if (mine.length >= 3 && theirs.length >= 3) {
        const share = mine.filter((b) => theirs.includes(b)).length / new Set([...mine, ...theirs]).size;
        if (share > rules.blockOverlapFail) errors.push(`${Math.round(share * 100)}% of the visual blocks are the previous video's (#${prev.id}), so it will look like the same video. Rebuild scenes or build new blocks`);
        else if (share > rules.blockOverlapWarn) warns.push(`${Math.round(share * 100)}% of the visual blocks are shared with #${prev.id}`);
      }
      const sig = new Set([...blocks.values()].filter((b) => b.signature).map((b) => b.id));
      const repeats = (v.blocks_used ?? v.blocks_planned ?? []).filter((b) => sig.has(b) && (prev.blocks_used ?? prev.blocks_planned ?? []).includes(b));
      if (repeats.length) warns.push(`signature block(s) ${repeats.join(', ')} also used in #${prev.id}; rotate the signature move`);
    }

    // The idea, the look, and what is new.
    if (isModern) {
      if (!v.logline) errors.push('meta.json logline is empty: one line every decision can be checked against');
      if (!(v.new_moves ?? []).length) {
        errors.push('meta.json new_moves is empty: name at least one move this page has not shown before (a transition, a component, a camera idea)');
      } else {
        for (const h of history.slice(-rules.window)) {
          for (const move of v.new_moves) {
            const old = (h.new_moves ?? []).find((m) => jaccard(m, move) > 0.5);
            if (old) errors.push(`new move "${move}" repeats #${h.id} ("${old}")`);
          }
        }
      }
      const look = String(v.look?.name ?? '').trim().toLowerCase();
      const lookOf = (h) => String(h.look?.name ?? '').trim().toLowerCase();
      if (!look) errors.push('meta.json look.name is empty: name the look and what it refers to (references/variation-playbook.md, "Name the look")');
      else if (prev && lookOf(prev) === look) errors.push(`same look "${v.look.name}" as the previous video #${prev.id}`);
      else if (history.slice(-rules.window).some((h) => lookOf(h) === look)) warns.push(`look "${v.look.name}" was used in the last ${rules.window}`);
      if (look && !v.look.reference) warns.push('look.reference is empty: point at a frame, a video, a brand surface, or a named style');
    }

    // Sound: a kit of its own, in step with the music axis.
    if (v.sound) {
      errors.push(...soundProblems(v.sound, history, rules, others));
      const music = musicEntry(ctx, v.axes?.music);
      if (music?.family && v.sound.family !== music.family) errors.push(`axes.music "${music.id}" means the ${music.family} family but sound.family is ${v.sound.family}. Change one (studio sound ${v.id} --reroll)`);
      if (music?.groove && v.sound.groove !== music.groove) warns.push(`axes.music "${music.id}" usually plays the ${music.groove} groove; sound.groove is ${v.sound.groove}`);
      if (!SHAPES[v.sound.shape]) errors.push(`sound.shape "${v.sound.shape}" is not one of ${Object.keys(SHAPES).join(', ')}`);
      const range = (music?.family && music.bpm) || FAMILIES[v.sound.family]?.bpm;
      if (range && v.bpm && (v.bpm < range[0] - 4 || v.bpm > range[1] + 4)) warns.push(`${v.bpm} BPM is outside the ${range.join(' to ')} BPM range of ${music?.id ?? v.sound.family}`);
    } else if (isModern) {
      errors.push(`meta.json has no sound design. Run \`studio sound ${v.id}\``);
    }

    // The source has to match the plan once building starts.
    const drift = (msg) => (built ? errors : warns).push(msg);
    const cuesFile = path.join(v.dir, 'src', 'cues.mjs');
    if (fs.existsSync(cuesFile)) {
      const src = fs.readFileSync(cuesFile, 'utf8');
      const g = src.match(/beatGrid\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
      if (g && v.bpm && v.bars && (Number(g[1]) !== Number(v.bpm) || Number(g[2]) !== Number(v.bars))) drift(`src/cues.mjs uses beatGrid(${g[1]}, ${g[2]}) but meta.json says ${v.bpm} BPM x ${v.bars} bars`);
      const snd = src.match(/export const SOUND = \{ groove: '([^']*)', shape: '([^']*)'/);
      if (snd && v.sound && (snd[1] !== v.sound.groove || snd[2] !== v.sound.shape)) drift(`src/cues.mjs SOUND is (${snd[1]}, ${snd[2]}) but meta.json sound is (${v.sound.groove}, ${v.sound.shape})`);
    }
    if (built && isModern) {
      for (const rel of scaffold.files ?? []) {
        const mineFile = path.join(v.dir, rel);
        const theirs = path.join(skillDir, 'template', rel);
        if (fs.existsSync(mineFile) && fs.existsSync(theirs) && fs.readFileSync(mineFile, 'utf8') === fs.readFileSync(theirs, 'utf8')) {
          errors.push(`${rel} is still the scaffold. The scaffold proves the pipeline; it is not this video`);
        }
      }
    }

    // Measured audio: what the rendered soundtrack actually sounds like next to earlier ones.
    const fp = v.audio_fp ?? (built ? audioFingerprint(v) : null);
    if (fp) {
      const top = audioMatches(fp, history, others)[0];
      if (top) {
        const detail = `${Math.round(top.score * 100)}% like ${top.who} (${Object.entries(top.parts).map(([k, x]) => `${k} ${Math.round(x * 100)}%`).join(', ')})`;
        if (top.score >= rules.audioSimilarityFail) errors.push(`the rendered soundtrack measures ${detail}. Redesign the kit: studio sound ${v.id} --reroll`);
        else if (top.score >= rules.audioSimilarityWarn) warns.push(`the rendered soundtrack measures ${detail}`);
        else notes.push(`closest earlier soundtrack: ${detail}`);
      }
    }
    if (isModern && ['rendered', 'posted'].includes(v.status)) {
      const problem = reviewProblem(v, rules);
      if (problem) warns.push(problem);
    }

    writeLedger(ctx, videos);
    for (const w of warns) console.log(`warn  ${w}`);
    if (errors.length) {
      for (const e of errors) console.log(`FAIL  ${e}`);
      process.exit(1);
    }
    for (const n of notes) console.log(`note  ${n}`);
    console.log(`PASS  #${v.id} is distinct from ${history.length} previous video(s) here${others.length ? ` and ${Math.min(others.length, rules.portfolioWindow)} recent video(s) made for other apps` : ''}.`);
  },

  log() {
    const ctx = loadStudio(requireStudio());
    const id = String(opts._[0] ?? '').padStart(3, '0');
    const v = loadVideos(ctx.dir).find((x) => x.id === id);
    if (!v) fail(`No video #${id}`);
    const file = path.join(v.dir, 'meta.json');
    const meta = readJson(file);
    if (opts.status) {
      if (!STATUSES.includes(opts.status)) fail(`status must be one of ${STATUSES.join(', ')}`);
      // A video is not finished until it has been looked at and fixed at least twice.
      if (opts.status === 'rendered' && modern(meta)) {
        const problem = reviewProblem(meta, ctx.rules);
        if (problem && !opts['skip-review']) fail(`Not finished: ${problem}. Fix what the review found, or pass --skip-review "<reason>" to record why not.`);
        if (problem) meta.notes = [meta.notes, `${today()}: review gate skipped: ${opts['skip-review']}`].filter(Boolean).join('\n');
      }
      meta.status = opts.status;
    }
    const manifest = readJson(path.join(v.dir, 'out', 'manifest.json'));
    if (manifest && (opts.status === 'rendered' || !meta.outputs?.files)) {
      meta.outputs = { built_at: manifest.built_at, files: manifest.outputs.map((o) => ({ ...o, path: path.join('out', o.file) })), covers: manifest.covers };
    }
    const perfKeys = { views: 'views', likes: 'likes', comments: 'comments', shares: 'shares', saves: 'saves', watch: 'avg_watch_s', completion: 'completion', url: 'url', 'posted-at': 'posted_at' };
    for (const [flag, key] of Object.entries(perfKeys)) {
      if (opts[flag] === undefined) continue;
      meta.performance ??= {};
      meta.performance[key] = ['url', 'posted_at'].includes(key) ? opts[flag] : Number(opts[flag]);
      meta.performance.updated = today();
    }
    if (opts.status === 'posted') {
      meta.performance ??= {};
      meta.performance.posted_at ??= today();
    }
    if (opts.note) meta.notes = [meta.notes, `${today()}: ${opts.note}`].filter(Boolean).join('\n');
    if (opts.status === 'rendered') {
      // Keep what later runs need to tell this video apart: a strip of frames and a measured soundtrack.
      const sheet = makeSheet(v);
      const fp = audioFingerprint(v);
      if (fp) meta.audio_fp = fp;
      console.log(`${sheet ? `Sheet: ${sheet}` : 'No render found for a sheet (run studio sheet later)'}${fp ? '; soundtrack fingerprinted' : '; no out/soundtrack.wav to fingerprint'}`);
    }
    writeJson(file, meta);
    const all = loadVideos(ctx.dir);
    writeLedger(ctx, all);
    syncPortfolio(ctx, all);
    console.log(`#${id} updated: status ${meta.status}${meta.performance ? `,${perfLine(meta.performance)}` : ''}`);
  },

  sound() {
    const ctx = loadStudio(requireStudio());
    const videos = loadVideos(ctx.dir);
    const id = String(opts._[0] ?? '').padStart(3, '0');
    const v = videos.find((x) => x.id === id);
    if (!v) fail(`No video #${id}`);
    const history = withSound(ctx, videos.filter((x) => x.id !== v.id && countable(x) && x.id < v.id));
    const others = otherApps(ctx);
    const file = path.join(v.dir, 'meta.json');
    const meta = readJson(file);
    const stored = meta.sound;
    const music = musicEntry(ctx, v.axes?.music);
    const fixed = pairs(opts.set);
    if (fixed.key !== undefined && /^\d+$/.test(fixed.key)) fixed.key = Number(fixed.key);
    if (fixed.sevenths !== undefined) fixed.sevenths = fixed.sevenths === 'true';
    if (fixed.path) fixed.path = String(fixed.path).split(/[\s-]+/).map(Number);
    // A supplied track is the bed: the kit only provides sound design.
    if (music?.id === 'supplied-track') fixed.shape ??= 'ui-only';
    let spec;
    if (stored && !opts.reroll && opts.seed === undefined && !fixed.family) {
      // Hand edits and --set changes sit on top of the stored design.
      spec = designKit({ ...stored, ...fixed }).spec;
    } else {
      const seed = opts.seed !== undefined ? Number(opts.seed) : stored ? (Number(stored.seed) + 104729) >>> 0 : hashSeed(`${ctx.app}/${v.id}/${v.slug}`);
      spec = designSound(ctx, v, history, others, { seed, fixed }).spec;
    }
    meta.sound = { ...spec, turn: stored?.turn ?? null, endBar: stored?.endBar ?? null };
    writeJson(file, meta);
    const cuesFile = path.join(v.dir, 'src', 'cues.mjs');
    if (fs.existsSync(cuesFile)) {
      const src = fs.readFileSync(cuesFile, 'utf8');
      const next = src.replace(/(export const SOUND = \{ groove: ')[^']*(', shape: ')[^']*(')/, `$1${spec.groove}$2${spec.shape}$3`);
      if (next !== src) fs.writeFileSync(cuesFile, next);
    }
    console.log(`Sound kit for #${v.id} (seed ${spec.seed}):\n  ${describeKit(spec).join('\n  ')}`);
    const range = (music?.family && music.bpm) || FAMILIES[spec.family].bpm;
    const target = CATALOG.axes.length.find((b) => b.id === v.axes?.length)?.target ?? Number(v.length ?? 24);
    const options = [range[0], Math.round((range[0] + range[1]) / 2), range[1]].map((bpm) => {
      const bars = Math.max(2, Math.round((target * bpm) / 240));
      return `${bars} bars @ ${bpm} = ${((bars * 240) / bpm).toFixed(1)}s`;
    });
    console.log(`  for about ${target}s: ${[...new Set(options)].join(', ')} (bars x 240 / BPM = seconds)`);
    if (music?.id === 'supplied-track') console.log('  supplied track: measure it with `node beats.mjs <file> > beats.json`, use its bpm in beatGrid, and place it with loadAudio (references/sound-design.md).');
    const problems = soundProblems(spec, history, ctx.rules, others);
    if (music?.family && spec.family !== music.family) problems.push(`axes.music "${music.id}" means the ${music.family} family but this kit is ${spec.family}`);
    const brandAvoid = ctx.brand.sound?.avoid ?? [];
    if (brandAvoid.includes(spec.family)) console.log(`warn  the brand's sonic identity avoids the ${spec.family} family; pick another music value if this is not deliberate`);
    for (const pr of problems) console.log(`FAIL  ${pr}`);
    if (problems.length) {
      console.log(`Try: studio sound ${v.id} --reroll, or choose a music value from another family.`);
      process.exit(1);
    }
    console.log(`PASS  this kit differs from ${history.filter((h) => h.sound).length} earlier soundtrack(s) here${others.some((o) => o.sound) ? ' and from other apps\' recent kits' : ''}. Stored in meta.json sound.`);
  },

  review() {
    const ctx = loadStudio(requireStudio());
    const id = String(opts._[0] ?? '').padStart(3, '0');
    const v = loadVideos(ctx.dir).find((x) => x.id === id);
    if (!v) fail(`No video #${id}`);
    const given = pairs(opts.scores);
    const scores = {};
    for (const key of Object.keys(REVIEW)) {
      const n = Number(given[key]);
      if (!Number.isInteger(n) || n < 1 || n > 10) fail(`--scores needs every dimension as a whole number from 1 to 10:\n${Object.entries(REVIEW).map(([k, what]) => `  ${k}: ${what}`).join('\n')}`);
      scores[key] = n;
    }
    const problems = String(opts.problems ?? '').split(';').map((x) => x.trim()).filter(Boolean);
    const low = Object.entries(scores).filter(([, n]) => n < ctx.rules.reviewMinScore);
    if (low.length && problems.length < 3) fail('Scores under the bar need the three biggest problems with timestamps: --problems "0:04 ...; 0:12 ...; 0:20 ..."');
    const file = path.join(v.dir, 'meta.json');
    const meta = readJson(file);
    meta.review ??= { rounds: [] };
    const round = { n: meta.review.rounds.length + 1, date: today(), scores, problems };
    meta.review.rounds.push(round);
    writeJson(file, meta);
    const log = path.join(v.dir, 'review.md');
    if (!fs.existsSync(log)) fs.writeFileSync(log, `# Review log: #${v.id} ${v.title ?? v.slug}\n\nOne entry per critique round. Scores are 1 to 10; every score needs ${ctx.rules.reviewMinScore} or more, after at least ${ctx.rules.reviewMinRounds} rounds.\n`);
    fs.appendFileSync(log, `\n## Round ${round.n} (${round.date})\n\n${Object.entries(scores).map(([k, n]) => `- ${k}: ${n} (${REVIEW[k]})`).join('\n')}\n\nProblems:\n${problems.length ? problems.map((x) => `- ${x}`).join('\n') : '- none'}\n`);
    console.log(`Round ${round.n} recorded: ${Object.entries(scores).map(([k, n]) => `${k} ${n}`).join(', ')}`);
    const left = reviewProblem(meta, ctx.rules);
    console.log(left ? `Not done: ${left}. Fix the problems, re-render the affected seconds, look again, and record another round.` : 'Review bar met.');
  },

  sheet() {
    const ctx = loadStudio(requireStudio());
    const id = String(opts._[0] ?? '').padStart(3, '0');
    const v = loadVideos(ctx.dir).find((x) => x.id === id);
    if (!v) fail(`No video #${id}`);
    const sheet = makeSheet(v);
    if (!sheet) fail(`No MP4 in ${path.join(v.dir, 'out')}. Render a preview (node render.mjs preview) or the final build first.`);
    console.log(`Sheet: ${sheet}`);
  },

  gallery() {
    const ctx = loadStudio(requireStudio());
    const videos = loadVideos(ctx.dir).filter(countable);
    const rows = [];
    for (const v of videos.slice(-Number(opts.last ?? 6))) {
      const file = path.join(v.dir, 'sheet.jpg');
      const sheet = fs.existsSync(file) ? file : makeSheet(v);
      if (sheet) rows.push({ label: `#${v.id} ${v.slug} [${v.status}]`, sheet });
    }
    const others = otherApps(ctx).filter((o) => o.sheet && fs.existsSync(o.sheet)).slice(-Number(opts.others ?? 3));
    for (const o of others) rows.push({ label: `${o.name ?? o.app} #${o.id} ${o.slug} (another app)`, sheet: o.sheet });
    if (!rows.length) return console.log('No sheets yet. After a render, `studio sheet <id>` (or `studio log <id> --status rendered`) saves one.');
    const out = path.join(ctx.dir, '.cache', 'gallery.jpg');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (rows.length === 1) fs.copyFileSync(rows[0].sheet, out);
    else {
      const inputs = rows.flatMap((r) => ['-i', r.sheet]);
      const graph = `${rows.map((_, i) => `[${i}:v]scale=1920:-2,pad=1920:ih+10:0:10:color=white[r${i}]`).join(';')};${rows.map((_, i) => `[r${i}]`).join('')}vstack=inputs=${rows.length}`;
      const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', graph, '-frames:v', '1', '-q:v', '4', out], { encoding: 'utf8' });
      if (r.status !== 0) fail(`ffmpeg could not build the gallery:\n${r.stderr}`);
    }
    console.log(`Gallery: ${out}\nRows, top to bottom (12 frames each, left to right in time):`);
    rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.label}`));
    console.log('Look at it. Name what these videos have in common (first frame, layout, ending, palette use, how text enters), then make sure the next one does not share it.');
  },

  async capture() {
    const ctx = loadStudio(requireStudio());
    const url = opts.url ?? opts._[0];
    if (!url) fail('Pass --url <address of the real product screen> (a deployed page or a local dev server).');
    const name = String(opts.name ?? new URL(url).pathname.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-') ?? '').toLowerCase() || 'home';
    const mobile = !opts.desktop;
    const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    const scale = mobile ? 3 : 2;
    const chromium = await loadChromium();
    const browser = await chromium.launch(process.env.CHROME_PATH ? { headless: true, executablePath: process.env.CHROME_PATH } : { headless: true, channel: 'chrome' });
    const context = await browser.newContext({ viewport, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile, colorScheme: opts.dark ? 'dark' : 'light' });
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 });
    } catch {
      await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
    }
    if (opts.wait) await page.waitForTimeout(Number(opts.wait));
    const dir = path.join(ctx.dir, 'brand', 'assets', 'screens');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name}${mobile ? '' : '-desktop'}${opts.dark ? '-dark' : ''}.png`);
    if (opts.selector) await page.locator(opts.selector).first().screenshot({ path: file });
    else await page.screenshot({ path: file, fullPage: Boolean(opts.full) });
    const title = await page.title();
    await browser.close();
    const brandFile = path.join(ctx.dir, 'brand', 'brand.json');
    const brand = readJson(brandFile, {});
    const rel = path.relative(path.join(ctx.dir, 'brand'), file).split(path.sep).join('/');
    const entry = { id: path.basename(file, '.png'), file: rel, url, viewport: `${viewport.width}x${viewport.height}@${scale}x`, what: opts.what ?? title, captured: today() };
    brand.surfaces = [...(brand.surfaces ?? []).filter((x) => x.id !== entry.id), entry];
    writeJson(brandFile, brand);
    console.log(`Captured ${file}\nRegistered as brand.surfaces "${entry.id}". View it, then set its "what" to a line describing the screen and the state it shows.`);
  },

  refs() {
    const ctx = loadStudio(requireStudio());
    const dir = path.join(ctx.dir, 'brand', 'refs');
    fs.mkdirSync(dir, { recursive: true });
    const src = opts._[0];
    const guide = path.join(ctx.dir, 'brand', 'style_guide.md');
    if (!src) {
      const files = fs.readdirSync(dir).filter((f) => !f.startsWith('.'));
      console.log(`References in ${dir}: ${files.join(', ') || 'none'}`);
      console.log(`Style guide: ${fs.existsSync(guide) ? guide : 'not written yet (brand/style_guide.md)'}`);
      return;
    }
    if (!fs.existsSync(src)) fail(`No file at ${src}`);
    const name = String(opts.name ?? path.basename(src, path.extname(src))).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (/\.(png|jpe?g|webp)$/i.test(src)) {
      const dst = path.join(dir, `${name}${path.extname(src).toLowerCase()}`);
      fs.copyFileSync(src, dst);
      console.log(`Reference frame: ${dst}\nView it and say what to take (palette, type, grain, layout) and what to leave (its subject, logos, characters).`);
      return;
    }
    const seconds = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src], { encoding: 'utf8' }).stdout) || 0;
    if (!seconds) fail(`ffprobe could not read ${src}`);
    const sheet = path.join(dir, `${name}-sheet.jpg`);
    const fps = Math.min(2, 30 / seconds);
    const made = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vf', `fps=${fps.toFixed(4)},scale=270:-2,tile=6x5`, '-frames:v', '1', '-q:v', '4', sheet], { encoding: 'utf8' });
    if (made.status !== 0) fail(`ffmpeg could not read ${src}:\n${made.stderr}`);
    // Cuts: frames where the picture changes sharply. Their spacing is the reference's pacing.
    const scan = spawnSync('ffmpeg', ['-hide_banner', '-i', src, '-vf', "select='gt(scene,0.3)',showinfo", '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const cuts = [...String(scan.stderr).matchAll(/pts_time:([\d.]+)/g)].map((m) => r3(Number(m[1])));
    const edges = [0, ...cuts, seconds];
    const shots = edges.slice(1).map((t, i) => r3(t - edges[i])).filter((d) => d > 0.05);
    const sorted = [...shots].sort((a, b) => a - b);
    const info = { file: path.basename(src), seconds: r3(seconds), cuts, shots: { count: shots.length, median: sorted[Math.floor(sorted.length / 2)], shortest: sorted[0], longest: sorted[sorted.length - 1] } };
    writeJson(path.join(dir, `${name}.json`), info);
    console.log(`Reference sheet (${fps.toFixed(2)} frames per second, 6 across): ${sheet}`);
    console.log(`${info.seconds}s, ${shots.length} shots: median ${info.shots.median}s, shortest ${info.shots.shortest}s, longest ${info.shots.longest}s${cuts.length ? `; cuts at ${cuts.slice(0, 24).join(', ')}${cuts.length > 24 ? ', ...' : ''}` : ' (no hard cuts found: one continuous take or soft transitions)'}`);
    console.log(`View the sheet, then write ${guide}: palette (hex), type (family, weight, tracking), shot lengths, transition types, camera moves, texture, and how text enters and leaves. Take the grammar of a reference, never its content, logos, or characters.`);
  },

  portfolio() {
    const [sub, arg] = opts._;
    if (!PORTFOLIO_FILE) return console.log('The portfolio is off (TIKTOK_PORTFOLIO=off).');
    if (sub === 'add') {
      const dir = path.resolve(arg ?? '');
      if (!fs.existsSync(path.join(dir, 'studio.json'))) fail(`No studio.json in ${dir}`);
      const ctx = loadStudio(dir);
      const videos = loadVideos(dir);
      syncPortfolio(ctx, videos);
      return console.log(`Recorded ${videos.filter((x) => ['rendered', 'posted'].includes(x.status)).length} finished video(s) from ${ctx.brand.name ?? ctx.app} in ${PORTFOLIO_FILE}`);
    }
    if (sub === 'forget') {
      const all = loadPortfolio();
      const keep = all.filter((e) => e.app !== arg);
      writeJson(PORTFOLIO_FILE, keep);
      return console.log(`Removed ${all.length - keep.length} entr${all.length - keep.length === 1 ? 'y' : 'ies'} for "${arg}".`);
    }
    const all = loadPortfolio();
    console.log(`Portfolio: ${PORTFOLIO_FILE} (${all.length} video(s) across ${new Set(all.map((e) => e.app)).size} app(s))`);
    for (const e of all) {
      console.log(`${e.name ?? e.app} #${e.id} ${e.slug} ${e.date}  "${e.hook_line}"`);
      console.log(`  ${PORTABLE.map((k) => `${k}=${e.axes?.[k] ?? '?'}`).join('  ')}`);
      console.log(`  structure ${e.shape || '?'}${e.sound ? `  sound ${soundLabel(e.sound)}` : '  sound not recorded'}${e.look ? `  look ${e.look}` : ''}${e.audio_fp ? '  soundtrack measured' : ''}${e.sheet ? '  strip kept' : ''}`);
    }
    if (!all.length) console.log('Empty. `studio status` in any studio records it and finds the studios in the repositories next to it.');
  },

  blocks() {
    const ctx = loadStudio(requireStudio());
    const videos = loadVideos(ctx.dir);
    const blocks = loadBlocks(ctx);
    const [sub, id] = opts._;
    if (sub === 'show') {
      const b = blocks.get(id);
      if (!b) fail(`No block "${id}"`);
      console.log(`${b.id} (${b.kind}, ${b.tier}, v${b.version ?? 1})${b.signature ? ' signature' : ''}\n${b.summary}\n\nParams:`);
      for (const [k, v] of Object.entries(b.params ?? {})) console.log(`  ${k}: ${v}`);
      console.log(`\nUsage:\n${b.usage}\n\nSource: ${b.dir}`);
      if (fs.existsSync(path.join(b.dir, 'preview.png'))) console.log(`Preview: ${path.join(b.dir, 'preview.png')}`);
      return;
    }
    if (sub === 'demo') return demoBlock(ctx, blocks, id);
    const usage = {};
    for (const v of videos) for (const b of v.blocks_used ?? []) usage[b] = (usage[b] ?? 0) + 1;
    const list = [...blocks.values()].filter((b) => !opts.kind || b.kind === opts.kind);
    console.log(`Building blocks: ${list.length} (${list.filter((b) => b.tier === 'generic').length} generic, ${list.filter((b) => b.tier === 'app').length} app). * = signature, rotate between videos.`);
    const short = (text, n = 96) => (text.length <= n ? text : `${text.slice(0, text.lastIndexOf(' ', n))}...`);
    for (const b of list) {
      console.log(`${`${b.id}${b.signature ? ' *' : ''}`.padEnd(26)} ${b.kind.padEnd(10)} ${b.tier.padEnd(8)} used ${String(usage[b.id] ?? 0).padEnd(3)} ${short(String(b.summary ?? ''))}`);
    }
    console.log('Details: studio.mjs blocks show <id>. Preview: studio.mjs blocks demo <id>.');
    const formats = loadFormats(ctx);
    console.log(`\nSaved formats (studio.mjs new --slug <slug> --format <id>): ${formats.length ? formats.map((f) => `${f.id} (from #${f.from_video})`).join(', ') : 'none yet'}`);
    writeCatalogs(ctx, videos);
  },

  harvest() {
    const ctx = loadStudio(requireStudio());
    const videos = loadVideos(ctx.dir);
    const id = String(opts._[0] ?? '').padStart(3, '0');
    const v = videos.find((x) => x.id === id);
    if (!v) fail(`No video #${id}`);
    const used = usedBlocks(v.dir);
    const dry = Boolean(opts['dry-run']);
    const added = [];
    const updated = [];
    for (const bid of listDirs(path.join(v.dir, 'blocks'))) {
      const bdir = path.join(v.dir, 'blocks', bid);
      const meta = readJson(path.join(bdir, 'block.json'));
      if (!meta) {
        console.log(`skip  ${bid}: no block.json`);
        continue;
      }
      const libRoot = meta.scope === 'app' ? path.join(ctx.dir, 'blocks') : SKILL_BLOCKS;
      const libDir = path.join(libRoot, bid);
      const exists = fs.existsSync(libDir);
      if (exists && dirHash(bdir) === dirHash(libDir)) continue;
      if (!used.has(bid)) {
        console.log(`skip  ${bid}: changed but not used by #${id} (only blocks exercised by a rendered video are promoted)`);
        continue;
      }
      const { problems, warns } = validateBlock(bdir, meta, ctx);
      for (const w of warns) console.log(`warn  ${bid}: ${w}`);
      if (problems.length) {
        for (const pr of problems) console.log(`FAIL  ${bid}: ${pr}`);
        continue;
      }
      const libMeta = exists ? readJson(path.join(libDir, 'block.json')) : null;
      if (libMeta && Number(meta.version ?? 1) <= Number(libMeta.version ?? 1)) meta.version = Number(libMeta.version ?? 1) + 1;
      meta.version ??= 1;
      meta.origin ??= `${ctx.studio.app ?? ctx.brand.app ?? 'app'} #${id}`;
      const note = `v${meta.version} ${today()}: ${exists ? 'updated' : 'added'} in ${ctx.studio.app ?? ''} #${id}`.replace(/\s+/g, ' ');
      meta.changelog = [...(meta.changelog ?? []).filter((c) => !c.startsWith(`v${meta.version} `)), note];
      if (dry) {
        console.log(`would ${exists ? 'update' : 'add'} ${bid} -> ${libDir}`);
        continue;
      }
      writeJson(path.join(bdir, 'block.json'), meta);
      fs.rmSync(libDir, { recursive: true, force: true });
      copyDir(bdir, libDir);
      (exists ? updated : added).push(bid);
      console.log(`${exists ? 'updated' : 'added'}  ${bid} (${meta.scope === 'app' ? 'studio' : 'generic'}, v${meta.version})`);
    }
    if (!dry) {
      const file = path.join(v.dir, 'meta.json');
      const m = readJson(file);
      m.blocks_used = [...used].sort();
      m.blocks_added = [...new Set([...(m.blocks_added ?? []), ...added])];
      m.blocks_updated = [...new Set([...(m.blocks_updated ?? []), ...updated])];
      writeJson(file, m);
      if (opts.format) {
        const fmt = m.axes?.format;
        if (!fmt) fail('meta.json axes.format is empty; cannot save a format');
        const dst = path.join(ctx.dir, 'formats', fmt);
        const prevFmt = readJson(path.join(dst, 'format.json'));
        fs.rmSync(path.join(dst, 'src'), { recursive: true, force: true });
        copyDir(path.join(v.dir, 'src'), path.join(dst, 'src'));
        if (fs.existsSync(path.join(v.dir, 'soundtrack.mjs'))) fs.copyFileSync(path.join(v.dir, 'soundtrack.mjs'), path.join(dst, 'soundtrack.mjs'));
        writeJson(path.join(dst, 'format.json'), {
          format: fmt,
          from_video: id,
          title: m.title,
          saved: today(),
          length: m.length,
          bpm: m.bpm,
          bars: m.bars,
          blocks: m.blocks_used,
          notes: 'Keep the beat structure and scene mechanics. Replace every string in src/copy.mjs, the world treatment, and the signature move.',
          history: [...(prevFmt?.history ?? []), ...(prevFmt ? [prevFmt.from_video] : [])],
        });
        console.log(`saved format "${fmt}" from #${id} -> ${dst}`);
      }
      writeCatalogs(ctx, loadVideos(ctx.dir));
      console.log(`#${id}: uses ${m.blocks_used.length} block(s); added ${added.length}, updated ${updated.length}.`);
    }
  },

  learn() {
    const text = opts._.join(' ').trim();
    if (!text) fail('Pass the lesson text.');
    const scope = opts.scope === 'engine' ? 'engine' : 'app';
    const file = scope === 'engine' ? path.join(skillDir, 'LEARNINGS.md') : path.join(requireStudio(), 'LEARNINGS.md');
    if (!fs.existsSync(file)) fs.writeFileSync(file, '# Learnings\n\n');
    const tag = opts.video ? ` (#${String(opts.video).padStart(3, '0')})` : '';
    fs.appendFileSync(file, `- ${today()}${tag}: ${text}\n`);
    console.log(`Added to ${file}`);
  },

  selftest() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'make-a-tiktok-selftest-'));
    const run = (args, cwd) => spawnSync('node', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: renderEnv });
    const bad = /\[pageerror\]|\[page:error\]|\[request failed\]|\[[45]\d\d\]|Error:/;
    let failed = false;
    run([path.join(skillDir, 'scripts', 'studio.mjs'), 'init', '--studio', tmp, '--app', 'sample', '--name', 'Sample'], tmp);
    fs.copyFileSync(path.join(skillDir, 'assets', 'sample-brand', 'brand.json'), path.join(tmp, 'brand', 'brand.json'));
    const made = run([path.join(skillDir, 'scripts', 'studio.mjs'), 'new', '--studio', tmp, '--slug', 'selftest'], tmp);
    if (made.status !== 0) {
      console.log(made.stdout, made.stderr);
      fail('scaffold failed');
    }
    const vdir = path.join(tmp, 'videos', '001-selftest');
    const sheet = run(['render.mjs', 'sheet', '--step', '1', '--cols', '8', '--tile', '180'], vdir);
    const out = `${sheet.stdout}${sheet.stderr}`;
    if (sheet.status !== 0 || bad.test(out)) {
      failed = true;
      console.log(`FAIL  template render\n${out}`);
    } else {
      console.log(`ok    template renders: ${path.join(vdir, 'out', 'sheet.png')}`);
    }
    const sound = run(['soundtrack.mjs', 'out/soundtrack.wav'], vdir);
    if (sound.status !== 0) {
      failed = true;
      console.log(`FAIL  template soundtrack\n${sound.stdout}${sound.stderr}`);
    } else {
      console.log('ok    template soundtrack renders');
    }
    // Every arrangement shape, each with a kit from a family that plays it.
    const shapeFamily = { 'build-drop': 'club', 'cold-open': 'dusty', 'stop-time': 'sub808', pulse: 'piano', swell: 'cinematic', stomp: 'percussion', 'ui-only': 'asmr' };
    const metaFile = path.join(vdir, 'meta.json');
    const cuesFile = path.join(vdir, 'src', 'cues.mjs');
    const cuesSrc = fs.readFileSync(cuesFile, 'utf8');
    for (const [shape, family] of Object.entries(shapeFamily)) {
      const spec = designKit({ seed: hashSeed(`selftest/${shape}`), family, shape }).spec;
      writeJson(metaFile, { ...readJson(metaFile), sound: spec });
      fs.writeFileSync(cuesFile, cuesSrc.replace(/(export const SOUND = \{ groove: ')[^']*(', shape: ')[^']*(')/, `$1${spec.groove}$2${spec.shape}$3`));
      const r = run(['soundtrack.mjs', `out/shape-${shape}.wav`], vdir);
      const bad2 = r.status !== 0 || /NaN|Error/.test(`${r.stdout}${r.stderr}`);
      console.log(`${bad2 ? 'FAIL' : 'ok  '}  sound shape ${shape} (${family})${bad2 ? `\n${r.stdout}${r.stderr}` : ''}`);
      failed ||= bad2;
    }
    fs.writeFileSync(cuesFile, cuesSrc);
    if (opts.blocks) {
      const ctx = loadStudio(tmp);
      for (const b of loadBlocks(ctx).values()) {
        if (b.kind === 'sound') {
          const r = spawnSync('node', ['--check', path.join(b.dir, 'index.mjs')], { encoding: 'utf8' });
          console.log(`${r.status === 0 ? 'ok  ' : 'FAIL'}  ${b.id} (syntax)`);
          failed ||= r.status !== 0;
          continue;
        }
        const res = demoBlock(ctx, loadBlocks(ctx), b.id, { quiet: true });
        console.log(`${res.ok ? 'ok  ' : 'FAIL'}  ${b.id}${res.ok ? `: ${res.out}` : `\n${res.log}`}`);
        failed ||= !res.ok;
      }
    }
    if (!opts.keep && !failed) fs.rmSync(tmp, { recursive: true, force: true });
    else console.log(`Kept ${tmp}`);
    if (failed) process.exit(1);
  },

  ledger() {
    const ctx = loadStudio(requireStudio());
    writeLedger(ctx, loadVideos(ctx.dir));
    console.log(`Wrote ${path.join(ctx.dir, 'LEDGER.md')}`);
  },

  backlog() {
    const ctx = loadStudio(requireStudio());
    const file = path.join(ctx.dir, 'backlog.json');
    const list = readJson(file, []);
    const [sub, ...args] = opts._;
    if (sub === 'add') {
      const fixed = {};
      for (const pair of String(opts.fix ?? '').split(',').filter(Boolean)) {
        const [k, val] = pair.split('=');
        fixed[k] = val;
      }
      list.push({ idea: args.join(' '), axes: fixed, added: today(), status: 'open' });
      writeJson(file, list);
      console.log(`Added idea [${list.length - 1}]`);
    } else if (sub === 'use') {
      const item = list[Number(args[0])];
      if (!item) fail('No such backlog item');
      Object.assign(item, { status: 'used', used_by: opts.by ?? null, used_on: today() });
      writeJson(file, list);
      console.log(`Marked [${args[0]}] used`);
    } else {
      list.forEach((b, i) => console.log(`[${i}] ${b.status === 'used' ? `used by #${b.used_by}` : 'open'}  ${b.idea}${Object.keys(b.axes ?? {}).length ? `  (${Object.entries(b.axes).map(([k, val]) => `${k}=${val}`).join(', ')})` : ''}`));
      if (!list.length) console.log('Backlog is empty.');
    }
  },
};

if (!commands[command]) fail(`Unknown command "${command}". Run: node studio.mjs help`);
await commands[command]();
