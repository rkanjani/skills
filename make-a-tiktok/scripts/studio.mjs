#!/usr/bin/env node
// Studio CLI for make-a-tiktok: the content ledger, the variation engine, and project scaffolding.
// No dependencies. Run `node studio.mjs help`.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const skillDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = JSON.parse(fs.readFileSync(path.join(skillDir, 'assets', 'axes.json'), 'utf8'));
const AXES = Object.keys(CATALOG.weights);
const STATUSES = ['scripting', 'building', 'rendered', 'posted', 'failed', 'archived'];

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
  const values = {};
  for (const axis of AXES) values[axis] = (CATALOG.axes[axis] ?? []).map((v) => v.id);
  values.feature = (brand.features ?? []).map((f) => f.id);
  values.persona = (studio.personas?.length ? studio.personas : brand.personas ?? []).map((p) => p.id);
  return { dir, studio, brand, rules, values };
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

// Hard rules for a candidate (full video meta or axes-only combo) against history.
function violations(candidate, history, rules, { checkCopy = true } = {}) {
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
  }
  if (checkCopy && candidate.hook_line) {
    for (const h of history) {
      if (!h.hook_line) continue;
      if (h.hook_line.trim().toLowerCase() === candidate.hook_line.trim().toLowerCase()) out.push(`hook line is identical to #${h.id}`);
      else {
        const s = jaccard(h.hook_line, candidate.hook_line);
        if (s > rules.hookSimilarityMax) out.push(`hook line is ${(s * 100).toFixed(0)}% similar to #${h.id} ("${h.hook_line}")`);
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
function noveltyOf(axis, value, history) {
  let weight = 0;
  history.forEach((h, i) => {
    if (h.axes?.[axis] === value) weight += 0.8 ** (history.length - 1 - i);
  });
  return 1 / (1 + weight) + (weight === 0 ? 0.25 : 0);
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

function suggest(ctx, history, { n = 6, seed = Date.now() % 100000, fixed = {} } = {}) {
  const { values, rules, studio } = ctx;
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
    if (violations(cand, history, rules, { checkCopy: false }).length) continue;
    let novelty = 0;
    let bonus = 0;
    const why = [];
    for (const axis of AXES) {
      if (!axes[axis]) continue;
      const nv = noveltyOf(axis, axes[axis], history);
      novelty += CATALOG.weights[axis] * nv;
      if (nv > 1) why.push(`new ${axis}`);
      const z = perf?.[`${axis}:${axes[axis]}`];
      if (z !== undefined) {
        // Strong enough that a proven hook or format can beat an untried one in exploit slots.
        bonus += CATALOG.weights[axis] * 0.9 * z;
        if (z > 0.5) why.push(`${axis} "${axes[axis]}" performs well`);
      }
    }
    pool.push({ axes, novelty, bonus, why });
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
    return `| ${v.id} | ${v.created ?? ''} | ${v.status} | ${String(v.hook_line ?? '').replace(/\|/g, '/')} | ${v.axes?.hook ?? ''} | ${v.axes?.format ?? ''} | ${v.axes?.feature ?? ''} | ${v.axes?.world ?? ''} | ${v.axes?.music ?? ''} | ${v.length ?? ''} | ${p.views ?? ''} | ${p.completion ? `${Math.round(p.completion * 100)}%` : ''} |`;
  });
  const text = [
    `# ${ctx.studio.name ?? 'TikTok studio'} ledger`,
    '',
    'Generated by `studio.mjs ledger`. Edit videos/*/meta.json, not this file.',
    '',
    '| # | Date | Status | Hook | Hook type | Format | Feature | World | Music | Len | Views | Completion |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
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
  const r = spawnSync('node', ['render.mjs', 'sheet', '--frames', '8', '--cols', '8', '--tile', '180', '--out', 'demo.png'], { cwd: proj, encoding: 'utf8' });
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

// Commands ---------------------------------------------------------------------------------------
const commands = {
  help() {
    console.log(`studio.mjs <command> [--studio <dir>]

  doctor                         check node, ffmpeg, Chrome, and playwright-core
  init --app <slug> --name <App> create a studio (default <repo>/marketing/tiktok)
  status                         counts, in-progress work, backlog
  history [--last 12]            previous videos: hooks, axes, copy, performance
  axes                           usage per axis value and what has never been tried
  suggest [--n 6] [--seed N] [--fix axis=value,...] [--series name]
                                 ranked axis combinations that pass the variation rules
  new --slug <slug> [--title ""] scaffold videos/NNN-slug from the template
  check <id>                     validate a video's meta.json against the rules
  log <id> [--status s] [--views n --likes n --comments n --shares n --saves n
           --watch seconds --completion 0-1 --url u --posted-at date] [--note ""]
  ledger                         regenerate LEDGER.md
  backlog add "<idea>" [--fix axis=value] | backlog list | backlog use <n> --by <id>

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
    const pw = fs.existsSync(path.join(skillDir, 'node_modules', 'playwright-core'));
    checks.push([pw, pw ? 'playwright-core installed in the skill' : `playwright-core missing: run npm install in ${skillDir}`]);
    for (const [ok, msg] of checks) console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
    if (checks.some(([ok]) => !ok)) process.exit(1);
  },

  init() {
    const root = opts.studio ? path.resolve(opts.studio) : path.join(gitRoot(process.cwd()) ?? process.cwd(), 'marketing', 'tiktok');
    const app = opts.app ?? path.basename(gitRoot(process.cwd()) ?? process.cwd()).toLowerCase();
    for (const d of [path.join(root, 'brand', 'assets'), path.join(root, 'videos'), path.join(root, 'blocks'), path.join(root, 'formats')]) {
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
    console.log(`Studio ready at ${root}\nNext: fill brand/brand.json (see references/brand-profile.md) and studio.json personas.`);
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
    writeLedger(ctx, videos);
    if (!ctx.values.feature.length) console.log('WARNING: brand.json has no features; variation needs them.');
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
  },

  axes() {
    const ctx = loadStudio(requireStudio());
    const history = loadVideos(ctx.dir).filter(countable);
    for (const axis of AXES) {
      const parts = ctx.values[axis].map((value) => {
        const uses = history.filter((h) => h.axes?.[axis] === value);
        return uses.length ? `${value} x${uses.length} (last #${uses[uses.length - 1].id})` : `${value} ·new`;
      });
      console.log(`${axis}: ${parts.join(', ') || '(no values: fill brand.json / studio.json)'}`);
    }
  },

  suggest() {
    const ctx = loadStudio(requireStudio());
    const history = loadVideos(ctx.dir).filter(countable);
    const fixed = {};
    for (const pair of String(opts.fix ?? '').split(',').filter(Boolean)) {
      const [k, v] = pair.split('=');
      fixed[k] = v;
    }
    if (opts.series) fixed.series = opts.series;
    const list = suggest(ctx, history, { n: Number(opts.n ?? 6), seed: opts.seed ?? Date.now() % 100000, fixed });
    if (!list.length) fail('No combination passes the rules. Loosen studio.json rules or add brand features.');
    list.forEach((c, i) => {
      console.log(`${i + 1}. [${c.mode}] score ${(c.novelty + (c.mode === 'exploit' ? c.bonus : 0)).toFixed(2)}  ${axesLine(c.axes)}`);
      if (c.why.length) console.log(`   ${[...new Set(c.why)].slice(0, 5).join('; ')}`);
    });
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
    for (const f of ['render.mjs', 'build.mjs', 'analyze-audio.mjs']) fs.copyFileSync(path.join(skillDir, 'engine', f), path.join(dir, f));
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
    meta.axes = { ...meta.axes, length: lengthBucket(meta.length) };
    writeJson(path.join(dir, 'meta.json'), meta);
    const script = fs.readFileSync(path.join(skillDir, 'template', 'script.md'), 'utf8')
      .replaceAll('{{id}}', id).replaceAll('{{title}}', meta.title).replaceAll('{{date}}', meta.created).replaceAll('{{app}}', ctx.brand.name ?? meta.app ?? '');
    fs.writeFileSync(path.join(dir, 'script.md'), script);
    fs.writeFileSync(path.join(dir, '.gitignore'), 'out/\n');
    writeLedger(ctx, loadVideos(ctx.dir));
    console.log(`Scaffolded #${id} at ${dir}`);
    if (startedFrom) console.log(`Started from the saved "${startedFrom.format}" format (#${startedFrom.video}). Keep its mechanics; replace the copy, world treatment, and signature move.`);
    const blocks = [...loadBlocks(ctx).values()];
    console.log(`Blocks available in ${path.join(dir, 'blocks')} (${blocks.length}): ${blocks.map((b) => `${b.id}${b.signature ? '*' : ''}`).join(', ')}`);
    console.log('Run `studio.mjs blocks` for summaries. Build new reusable pieces as blocks, not inline scene code.');
  },

  check() {
    const ctx = loadStudio(requireStudio());
    const videos = loadVideos(ctx.dir);
    const id = String(opts._[0] ?? '').padStart(3, '0');
    const v = videos.find((x) => x.id === id);
    if (!v) fail(`No video #${id}`);
    const history = videos.filter((x) => x.id !== v.id && countable(x) && x.id < v.id);
    const errors = [];
    for (const field of ['hook_line', 'scenes', 'length', 'bpm', 'bars']) {
      if (v[field] === undefined || v[field] === null || v[field] === '' || (Array.isArray(v[field]) && !v[field].length)) errors.push(`meta.json is missing ${field}`);
    }
    for (const axis of AXES) {
      const value = v.axes?.[axis];
      if (!value) errors.push(`axes.${axis} is empty`);
      else if (ctx.values[axis].length && !ctx.values[axis].includes(String(value))) errors.push(`axes.${axis}="${value}" is not in the catalog (add it to brand.json/studio.json or pick a listed value)`);
    }
    if (v.bpm && v.bars && v.length && Math.abs((v.bars * 240) / v.bpm - v.length) > 0.06) {
      errors.push(`bars x 240 / bpm = ${((v.bars * 240) / v.bpm).toFixed(2)}s, not the ${v.length}s length`);
    }
    if (v.length && v.axes?.length !== lengthBucket(v.length)) errors.push(`axes.length is "${v.axes?.length}" but a ${v.length}s video belongs in "${lengthBucket(v.length)}"`);
    // Comprehension comes before brevity: under the length ceiling, with time to read every scene.
    if (Number(v.length) >= ctx.rules.maxLength) errors.push(`length ${v.length}s: every video stays under ${ctx.rules.maxLength}s`);
    // The reading budget counts what scenes say the viewer must read, not every UI label.
    const mustRead = Array.isArray(v.scenes) && v.scenes.length ? v.scenes.flatMap((sc) => sc.copy ?? []) : v.copy ?? [];
    const words = countWords(mustRead);
    const wps = v.length ? words / Number(v.length) : 0;
    if (wps > ctx.rules.maxWordsPerSecond) errors.push(`${words} words to read in ${v.length}s is ${wps.toFixed(1)} words/s; cut copy or give the video more time (under ${ctx.rules.maxLength}s)`);
    const pace = paceProblems(v, ctx.rules);
    errors.push(...pace.errors);
    const banned = ctx.brand.voice?.banned ?? [];
    for (const token of banned) if (copyText(v).includes(token)) errors.push(`copy contains banned text "${token}" (brand voice rules)`);
    errors.push(...violations(v, history, ctx.rules));
    writeLedger(ctx, videos);
    const warns = warnings(v, history, ctx.rules);
    warns.push(...pace.warns);
    if (wps > ctx.rules.warnWordsPerSecond && wps <= ctx.rules.maxWordsPerSecond) warns.push(`copy runs ${wps.toFixed(1)} words/s; make sure every line holds still long enough to read`);
    const sig = new Set([...loadBlocks(ctx).values()].filter((b) => b.signature).map((b) => b.id));
    const prev = history[history.length - 1];
    const mine = v.blocks_used ?? v.blocks_planned ?? [];
    const repeats = mine.filter((b) => sig.has(b) && (prev?.blocks_used ?? prev?.blocks_planned ?? []).includes(b));
    if (repeats.length) warns.push(`signature block(s) ${repeats.join(', ')} also used in #${prev.id}; rotate the signature move`);
    for (const w of warns) console.log(`warn  ${w}`);
    if (errors.length) {
      for (const e of errors) console.log(`FAIL  ${e}`);
      process.exit(1);
    }
    console.log(`PASS  #${v.id} is distinct from ${history.length} previous video(s).`);
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
    writeJson(file, meta);
    writeLedger(ctx, loadVideos(ctx.dir));
    console.log(`#${id} updated: status ${meta.status}${meta.performance ? `,${perfLine(meta.performance)}` : ''}`);
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
    const run = (args, cwd) => spawnSync('node', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
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
commands[command]();
