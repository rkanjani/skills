#!/usr/bin/env node
// Builds every deliverable for this video: soundtrack, motion-blurred 60 fps frames, loudness-
// normalized encodes, cover frames, and a manifest with measured specs. Frames are deleted at the
// end to keep disk use bounded when running in a loop.
//
//   node build.mjs                 full build
//   node build.mjs --reuse         re-encode from existing frames and audio
//   node build.mjs --keep-frames   keep out/frames for later re-encodes
//
// Also writes what the critique needs: out/contact.png (the whole piece, two frames per second),
// out/phone/*.png (one frame per scene at the 360 px width a phone shows), and for a seamless-loop
// ending out/loop-check.mp4 (the video twice) and out/seam.png (first and last six frames).
//
// Reads meta.json: slug, covers (seconds), crop45 (y offset of the 4:5 crop, default 185), scenes,
// and axes.ending.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'out');
const frames = path.join(out, 'frames');
const args = new Set(process.argv.slice(2));
const meta = fs.existsSync(path.join(here, 'meta.json')) ? JSON.parse(fs.readFileSync(path.join(here, 'meta.json'), 'utf8')) : {};
const NAME = meta.slug ? `${meta.id ?? ''}${meta.id ? '-' : ''}${meta.slug}` : path.basename(here);

function run(cmd, cmdArgs, { capture = false } = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd: here, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    if (capture) process.stderr.write(r.stderr ?? '');
    throw new Error(`${cmd} ${cmdArgs.join(' ')} failed`);
  }
  return capture ? `${r.stdout}${r.stderr}` : '';
}

function checkDisk(seconds) {
  // About 60 MB of PNG frames per second of video plus encodes. Refuse to start when tight.
  const need = seconds * 60 * 1024 * 1024 * 1.5 + 400 * 1024 * 1024;
  const st = fs.statfsSync(here);
  const free = st.bavail * st.bsize;
  if (free < need) throw new Error(`Not enough disk: ${(free / 1e9).toFixed(1)} GB free, need about ${(need / 1e9).toFixed(1)} GB`);
}

// Two-pass EBU R128 normalization to the -14 LUFS social target with a -1 dBTP ceiling.
function loudnorm(input, output) {
  const target = 'I=-14:TP=-1.0:LRA=11';
  const report = run('ffmpeg', ['-hide_banner', '-nostats', '-i', input, '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-'], { capture: true });
  const m = JSON.parse(report.slice(report.lastIndexOf('{'), report.lastIndexOf('}') + 1));
  const second = `loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-af', `${second},aresample=48000`, '-c:a', 'pcm_s24le', output]);
  return Number(m.input_i);
}

const VIDEO = [
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-tune', 'film', '-profile:v', 'high', '-level:v', '4.2',
  '-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
  '-movflags', '+faststart',
];
// Light luma grain keeps dark gradients from banding after platform recompression.
const GRADE = 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,noise=c0s=4:c0f=t+u';

function encode(audio, file, { fps = 60, crop = null } = {}) {
  const pre = [crop ? `crop=${crop}` : null, fps === 60 ? null : `select='not(mod(n\\,2))',setpts=N/30/TB`].filter(Boolean);
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', '60', '-i', path.join(frames, 'f_%05d.png'),
    '-i', audio, '-vf', [...pre, GRADE].join(','), '-r', String(fps), '-g', String(fps * 2), ...VIDEO,
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-shortest', path.join(out, file)]);
  return file;
}

function probe(file) {
  const p = path.join(out, file);
  const v = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate,nb_frames', '-of', 'json', p], { capture: true });
  const s = JSON.parse(v).streams[0];
  const loud = run('ffmpeg', ['-hide_banner', '-nostats', '-i', p, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { capture: true });
  const summary = loud.slice(loud.lastIndexOf('Summary'));
  const I = Number((summary.match(/I:\s+(-?[\d.]+) LUFS/) ?? [])[1]);
  const peak = Number((summary.match(/Peak:\s+(-?[\d.]+) dBFS/) ?? [])[1]);
  return { file, width: s.width, height: s.height, fps: s.avg_frame_rate, frames: Number(s.nb_frames), mb: +(fs.statSync(p).size / 1e6).toFixed(1), lufs: I, truePeak: peak };
}

const started = Date.now();
if (!args.has('--reuse')) {
  run('node', ['soundtrack.mjs', 'out/soundtrack.wav']);
  const probeDuration = Number(meta.length ?? 15);
  checkDisk(probeDuration);
  run('node', ['render.mjs', 'video', '--fps', '60', '--shutter', '4']);
}

const count = fs.readdirSync(frames).filter((f) => f.endsWith('.png')).length;
const mixIn = loudnorm(path.join(out, 'soundtrack.wav'), path.join(out, 'mix-14lufs.wav'));
loudnorm(path.join(out, 'soundtrack-sfx.wav'), path.join(out, 'sfx-14lufs.wav'));

const files = [
  encode(path.join(out, 'mix-14lufs.wav'), `${NAME}-9x16.mp4`),
  encode(path.join(out, 'mix-14lufs.wav'), `${NAME}-9x16-30fps.mp4`, { fps: 30 }),
  encode(path.join(out, 'mix-14lufs.wav'), `${NAME}-4x5.mp4`, { crop: `1080:1350:0:${meta.crop45 ?? 185}` }),
  encode(path.join(out, 'sfx-14lufs.wav'), `${NAME}-9x16-sfx-only.mp4`),
];

const covers = (meta.covers?.length ? meta.covers : [0.9, (count / 60) * 0.55, count / 60 - 0.1]).map((t, i) => {
  const frame = Math.min(count - 1, Math.max(0, Math.round(t * 60)));
  const file = `cover-${i + 1}.png`;
  fs.copyFileSync(path.join(frames, `f_${String(frame).padStart(5, '0')}.png`), path.join(out, file));
  return { file, t };
});

// Review material, made from the final encode so it shows what a viewer gets.
const outputs = files.map(probe);
const seconds = count / 60;
const main = path.join(out, files[0]);
const encoded = outputs[0].frames || count;
const quiet = ['-hide_banner', '-loglevel', 'error', '-y'];
run('ffmpeg', [...quiet, '-i', main, '-vf', `fps=2,scale=180:-2,tile=10x${Math.max(1, Math.ceil((seconds * 2) / 10))}`, '-frames:v', '1', path.join(out, 'contact.png')]);
const phoneDir = path.join(out, 'phone');
fs.rmSync(phoneDir, { recursive: true, force: true });
fs.mkdirSync(phoneDir, { recursive: true });
const moments = (meta.scenes?.length ? meta.scenes.map((sc) => (Number(sc.at) + Number(sc.out)) / 2) : covers.map((c) => c.t)).filter((t) => t >= 0 && t < seconds).slice(0, 12);
const phone = moments.map((t, i) => {
  const file = path.join('phone', `${String(i + 1).padStart(2, '0')}-${t.toFixed(1)}s.png`);
  run('ffmpeg', [...quiet, '-ss', t.toFixed(3), '-i', main, '-vf', 'scale=360:-2', '-frames:v', '1', path.join(out, file)]);
  return file;
});
const review = { contact: 'contact.png', phone };
if (meta.axes?.ending === 'seamless-loop') {
  run('ffmpeg', [...quiet, '-stream_loop', '1', '-i', main, '-c', 'copy', path.join(out, 'loop-check.mp4')]);
  run('ffmpeg', [...quiet, '-i', main, '-vf', `select='lt(n\\,6)+gte(n\\,${encoded - 6})',scale=160:-2,tile=12x1`, '-fps_mode', 'passthrough', '-frames:v', '1', path.join(out, 'seam.png')]);
  Object.assign(review, { loop: 'loop-check.mp4', seam: 'seam.png' });
}

const manifest = {
  name: NAME,
  built_at: new Date().toISOString(),
  frames: count,
  mix_loudness_before: mixIn,
  outputs,
  covers,
  review,
  build_seconds: Math.round((Date.now() - started) / 1000),
};
fs.writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
for (const f of ['mix-14lufs.wav', 'sfx-14lufs.wav']) fs.rmSync(path.join(out, f), { force: true });
if (!args.has('--keep-frames')) fs.rmSync(frames, { recursive: true, force: true });

console.log(`Review: out/contact.png, out/phone/ (${phone.length} frames at phone width)${review.seam ? ', out/seam.png (frames 1-6 then the last six: the last must lead into the first), out/loop-check.mp4' : ''}`);
for (const o of manifest.outputs) console.log(`${o.file}  ${o.width}x${o.height} ${o.fps} ${o.frames}f  ${o.mb} MB  ${o.lufs} LUFS  peak ${o.truePeak} dBFS`);
console.log(`Done in ${manifest.build_seconds}s -> ${out}`);
