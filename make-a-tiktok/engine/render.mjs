#!/usr/bin/env node
// Frame-accurate renderer. The composition exposes window.seek(t) and window.DURATION. This
// serves the studio over localhost, drives headless Chrome frame by frame, and pipes screenshots
// into ffmpeg. Motion blur comes from temporal supersampling: each output frame averages
// `--shutter` sub-frames across a 180 degree shutter.
//
//   node render.mjs sheet   --step 0.25            contact sheet of the timeline (review)
//   node render.mjs stills  --times 0.4,2.1,7.6    full-res PNGs (detail review)
//   node render.mjs preview --fps 30 [--audio out/soundtrack.wav]   fast MP4, no motion blur
//   node render.mjs video   --fps 60 --shutter 4 --workers 4        final PNG frames in out/frames
//   node render.mjs verify  [--times 1,5,9]        determinism: the same frames twice, in a different order
//
// Requires Google Chrome (or set CHROME_PATH), ffmpeg, and the playwright-core package
// (resolved from this folder upward, or install it: npm i -D playwright-core).

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'out');

// Serve from the studio root (the folder with studio.json) so pages can reach ../../brand.
function findRoot(dir) {
  let cur = dir;
  for (let i = 0; i < 6; i += 1) {
    if (fs.existsSync(path.join(cur, 'studio.json'))) return cur;
    const up = path.dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  return dir;
}
const root = findRoot(here);
const pagePath = `/${path.relative(root, path.join(here, 'index.html')).split(path.sep).join('/')}`;

async function loadChromium() {
  // The skill ships playwright-core; also accept one installed in the studio, repo, or cwd.
  // The studio CLI leaves a hint at <studio>/.cache/skill-home, so any install location works.
  const hintFile = path.join(root, '.cache', 'skill-home');
  const hint = fs.existsSync(hintFile) ? fs.readFileSync(hintFile, 'utf8').trim() : null;
  const skillHomes = [process.env.MAKE_A_TIKTOK_HOME, hint, path.join(os.homedir(), '.claude/skills/make-a-tiktok'), path.join(os.homedir(), '.agents/skills/make-a-tiktok')].filter(Boolean);
  const candidates = [here, root, process.cwd(), ...skillHomes];
  for (const base of candidates) {
    try {
      const req = createRequire(path.join(base, 'noop.js'));
      const mod = await import(pathToFileURL(req.resolve('playwright-core')).href);
      return mod.chromium ?? mod.default.chromium;
    } catch {
      // try next location
    }
  }
  throw new Error('playwright-core not found. Run `npm i -D playwright-core` in the studio or video folder.');
}

const [mode = 'sheet', ...rest] = process.argv.slice(2);
const opts = {};
for (let i = 0; i < rest.length; i += 1) {
  const key = rest[i].replace(/^--/, '');
  const next = rest[i + 1];
  if (next === undefined || next.startsWith('--')) opts[key] = true;
  else {
    opts[key] = next;
    i += 1;
  }
}
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = Number(opts.fps ?? (mode === 'video' ? 60 : 30));
const SHUTTER = Number(opts.shutter ?? (mode === 'video' ? 4 : 1));
const SHUTTER_ANGLE = Number(opts.angle ?? 180);
const WORKERS = Number(opts.workers ?? (mode === 'video' ? Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2))) : 1));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
};

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/favicon.ico') return res.writeHead(204).end();
    const filePath = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (!filePath.startsWith(root)) return res.writeHead(403).end();
    fs.readFile(filePath, (error, data) => {
      if (error) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function openComposition(port) {
  const chromium = await loadChromium();
  const launch = {
    headless: true,
    args: ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none', '--hide-scrollbars',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  };
  const browser = await chromium.launch(process.env.CHROME_PATH ? { ...launch, executablePath: process.env.CHROME_PATH } : { ...launch, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[page:${m.type()}] ${m.text()}`);
  });
  page.on('requestfailed', (r) => console.log(`[request failed] ${r.url()}`));
  page.on('response', (r) => {
    if (r.status() >= 400) console.log(`[${r.status()}] ${r.url()}`);
  });
  page.on('pageerror', (e) => console.error('[pageerror]', e));
  await page.goto(`http://127.0.0.1:${port}${pagePath}?render=1`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 90_000 });
  const [duration, cdp] = await Promise.all([page.evaluate(() => window.DURATION), context.newCDPSession(page)]);
  return { browser, page, cdp, duration };
}

async function capture({ page, cdp }, t, format = 'png') {
  await page.evaluate((time) => window.seek(time), t);
  const { data } = await cdp.send('Page.captureScreenshot', {
    format, ...(format === 'jpeg' ? { quality: 94 } : {}), optimizeForSpeed: true, captureBeyondViewport: false, fromSurface: true,
  });
  return Buffer.from(data, 'base64');
}

// Run async steps strictly one after another (one browser page can only capture one frame at a time).
const inSequence = (items, fn) => items.reduce((chain, item, i) => chain.then(() => fn(item, i)), Promise.resolve());

function ffmpeg(args) {
  const proc = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)))));
  return { proc, done };
}

function write(stream, buffer) {
  return new Promise((resolve, reject) => {
    if (stream.write(buffer, (e) => (e ? reject(e) : null))) resolve();
    else stream.once('drain', resolve);
  });
}

async function renderChunk(port, frames, framesDir, duration, label) {
  const comp = await openComposition(port);
  const blend = SHUTTER > 1 ? `tmix=frames=${SHUTTER},select='eq(mod(n\\,${SHUTTER})\\,${SHUTTER - 1})',setpts=N/${FPS}/TB` : 'null';
  const { proc, done } = ffmpeg(['-f', 'image2pipe', '-framerate', String(FPS * SHUTTER), '-c:v', 'png', '-i', '-', '-vf', blend,
    '-fps_mode', 'passthrough', '-start_number', String(frames[0]), path.join(framesDir, 'f_%05d.png')]);
  const open = SHUTTER_ANGLE / 360 / FPS;
  const started = Date.now();
  const times = frames.flatMap((frame) => {
    const t = frame / FPS;
    return SHUTTER > 1 ? Array.from({ length: SHUTTER }, (_, k) => t + ((k + 0.5) / SHUTTER - 0.5) * open) : [t];
  });
  await inSequence(times, async (s, i) => {
    await write(proc.stdin, await capture(comp, Math.max(0, Math.min(duration - 1e-4, s))));
    const done = Math.floor(i / SHUTTER);
    if (i % (60 * SHUTTER) === 0) console.log(`[${label}] ${done + 1}/${frames.length} ${((done + 1) / ((Date.now() - started) / 1000)).toFixed(1)} fps`);
  });
  proc.stdin.end();
  await done;
  await comp.browser.close();
}

async function renderVideo(port) {
  const probe = await openComposition(port);
  const duration = Number(opts.duration ?? probe.duration);
  await probe.browser.close();
  const framesDir = path.join(outDir, 'frames');
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
  const first = Math.round(Number(opts.from ?? 0) * FPS);
  const last = Math.round(Number(opts.to ?? duration) * FPS);
  const all = Array.from({ length: last - first }, (_, i) => first + i);
  const size = Math.ceil(all.length / WORKERS);
  const chunks = Array.from({ length: WORKERS }, (_, w) => all.slice(w * size, (w + 1) * size)).filter((c) => c.length);
  const started = Date.now();
  await Promise.all(chunks.map((chunk, w) => renderChunk(port, chunk, framesDir, duration, `w${w}`)));
  console.log(`Rendered ${all.length} frames in ${((Date.now() - started) / 1000).toFixed(1)}s -> ${framesDir}`);
}

async function renderPreview(port) {
  const comp = await openComposition(port);
  const duration = comp.duration;
  const out = path.join(outDir, opts.out ?? 'preview.mp4');
  const audio = opts.audio ? ['-i', path.resolve(here, opts.audio)] : [];
  const { proc, done } = ffmpeg(['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', ...audio,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    ...(audio.length ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : []), '-movflags', '+faststart', out]);
  const total = Math.round(duration * FPS);
  await inSequence(Array.from({ length: total }, (_, i) => i / FPS), async (t) => write(proc.stdin, await capture(comp, t, 'jpeg')));
  proc.stdin.end();
  await done;
  await comp.browser.close();
  console.log(`Preview -> ${out}`);
}

async function renderStills(port) {
  const comp = await openComposition(port);
  const dir = path.join(outDir, opts.dir ?? 'stills');
  fs.mkdirSync(dir, { recursive: true });
  await inSequence(String(opts.times ?? '0').split(',').map(Number), async (t) => {
    const file = path.join(dir, `t_${t.toFixed(3)}.png`);
    fs.writeFileSync(file, await capture(comp, t));
    console.log(file);
  });
  await comp.browser.close();
}

async function renderSheet(port) {
  const comp = await openComposition(port);
  const duration = comp.duration;
  const step = Number(opts.step ?? 0.25);
  const cols = Number(opts.cols ?? 10);
  const tileW = Number(opts.tile ?? 216);
  const tileH = Math.round((tileW * HEIGHT) / WIDTH);
  const times = [];
  if (opts.times) times.push(...String(opts.times).split(',').map(Number));
  else if (opts.frames) {
    // N frames spread evenly across the timeline (block demos, quick overviews).
    const n = Number(opts.frames);
    for (let i = 0; i < n; i += 1) times.push(Number((((i + 0.5) * duration) / n).toFixed(4)));
  } else for (let t = Number(opts.from ?? 0); t < Number(opts.to ?? duration) - 1e-6; t += step) times.push(Number(t.toFixed(4)));
  const rows = Math.ceil(times.length / cols);
  const out = path.join(outDir, opts.out ?? 'sheet.png');
  fs.mkdirSync(outDir, { recursive: true });
  const { proc, done } = ffmpeg(['-f', 'image2pipe', '-framerate', '1', '-c:v', 'mjpeg', '-i', '-',
    '-vf', `scale=${tileW}:${tileH}:flags=area,tile=${cols}x${rows}:padding=4:margin=4:color=0x333333`, '-frames:v', '1', out]);
  await inSequence(times, async (t) => write(proc.stdin, await capture(comp, t, 'jpeg')));
  proc.stdin.end();
  await done;
  await comp.browser.close();
  console.log(`Sheet (${times.length} frames: ${times[0]}s to ${times[times.length - 1]}s) -> ${out}`);
}

// Every frame must be a pure function of time: workers capture frames out of order, so a frame that
// depends on what was drawn before it shows up as a pop in the final. Capture sample frames going
// forward on one page and backward on a fresh one, and compare them. Rasterizing can differ by one
// level on a few pixels between runs (above 90 dB PSNR); a real order dependence lands far lower.
async function verifyDeterminism(port) {
  const dir = path.join(outDir, '.verify');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const first = await openComposition(port);
  const times = opts.times
    ? String(opts.times).split(',').map(Number)
    : Array.from({ length: 6 }, (_, i) => Number((((i + 0.5) * first.duration) / 6).toFixed(3)));
  await inSequence(times, async (t, i) => fs.writeFileSync(path.join(dir, `a${i}.png`), await capture(first, t)));
  await first.browser.close();
  const second = await openComposition(port);
  await inSequence(times.map((t, i) => [t, i]).reverse(), async ([t, i]) => fs.writeFileSync(path.join(dir, `b${i}.png`), await capture(second, t)));
  await second.browser.close();
  const floor = Number(opts.psnr ?? 60);
  const drift = [];
  times.forEach((t, i) => {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-i', path.join(dir, `a${i}.png`), '-i', path.join(dir, `b${i}.png`), '-lavfi', 'psnr', '-f', 'null', '-'], { encoding: 'utf8' });
    const m = String(r.stderr).match(/average:(inf|[\d.]+)/);
    const db = m && m[1] !== 'inf' ? Number(m[1]) : Infinity;
    if (!m || db < floor) drift.push(`${t}s (${m ? `${db.toFixed(1)} dB` : 'unreadable'})`);
  });
  if (drift.length) {
    console.log(`NOT DETERMINISTIC at ${drift.join(', ')}: these frames depend on capture order. Compare ${dir}/a*.png with b*.png, and look for state carried between frames, CSS transitions or animations, Math.random, or wall-clock time.`);
    process.exitCode = 1;
  } else {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`Deterministic: ${times.length} frames matched when captured in a different order (${times.join(', ')}s).`);
  }
}

const server = await serve();
const { port } = server.address();
fs.mkdirSync(outDir, { recursive: true });
try {
  if (mode === 'video') await renderVideo(port);
  else if (mode === 'stills') await renderStills(port);
  else if (mode === 'preview') await renderPreview(port);
  else if (mode === 'verify') await verifyDeterminism(port);
  else await renderSheet(port);
} finally {
  server.close();
}
