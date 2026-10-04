# Engine API

Every video folder is self-contained: `lib/` is a copy of the engine taken when the video was
scaffolded, so old videos keep rendering the same way after the skill changes. Scenes are plain
ES modules loaded by `index.html`. Nothing may read wall-clock time or `Math.random`: every
frame must be a pure function of `t` so the renderer can capture frames in any order.

## Contents

- Project layout
- Building blocks
- `lib/core.mjs`: timing, easing, DOM
- `lib/world3d.mjs` and `lib/worlds.mjs`: the 3D line-art world
- `lib/kit.mjs`: motion components
- `lib/fx.mjs`: particles and flashes
- `lib/boot.mjs`: runtime and scene contract
- `lib/synth.mjs`: sound
- CLIs: render, build, analyze-audio

## Project layout

```
videos/NNN-slug/
  index.html          loads lib/kit.css, src/style.css, src/main.mjs
  meta.json           ledger entry (axes, copy, status, outputs, performance)
  script.md           the creative script
  src/cues.mjs        beat grid + named cue times + KICKS (shared with sound)
  src/copy.mjs        every on-screen string
  src/world.mjs       world preset/geometry + camera tracks
  src/scenes.mjs      scene factories (split into more files freely)
  src/main.mjs        boot({ duration, world, scenes })
  src/style.css       per-video styles (use brand CSS variables)
  blocks/             snapshot of the block library (generic + app) taken at scaffold time
  soundtrack.mjs      arrangement using lib/synth.mjs (and sound blocks)
  render.mjs build.mjs analyze-audio.mjs
  out/                renders (gitignored)
```

## Building blocks

Reusable parts live in `blocks/<id>/index.mjs` with a `block.json`. Components export
`create(ctx, params)` returning `{ root, update(t, frame) }`, so they drop straight into `boot`'s
scene list; overlays export `createOverlay(ctx, params)`; sound blocks export `arrange(mix, grid,
params)`. Import them relative to the file: `'../blocks/<id>/index.mjs'` from `src/`,
`'./blocks/<id>/index.mjs'` from `soundtrack.mjs`. `studio blocks` lists them, `studio blocks
show <id>` prints params and a usage snippet, `studio blocks demo <id>` renders a contact sheet.
See `references/building-blocks.md` for conventions and harvesting.

## core.mjs

- `W`, `H`: 1080 x 1920.
- `PACE`: house timings in seconds, `{ enter: 0.5, exit: 0.4, stagger: 0.14, accent: 0.24,
  glide: 1.0 }`. Every block uses them as defaults and takes a `pace` param to override them
  (`pace: { exit: 0.5 }`). Use them in scene code too, so a video's transitions stay consistent.
- `beatGrid(bpm, bars)` returns `{ beat, bar, duration, b(n), step(bar, sixteenth) }`. `b(4.5)` is
  the time of beat 4.5. Pick bars and BPM so `bars * 240 / bpm` equals the length exactly.
- `track(t, [[t0, v0], [t1, v1, ease], ...])`: keyframes; values may be arrays. Keys time-sorted.
- `spring(elapsed, { stiffness, damping })`: 0 to 1 with overshoot. Start it slightly before a beat.
- Easing: `E.outExpo`, `E.outBack(x, s)`, `E.inCubic`, ... plus house curves `snap` (decisive
  settle), `whip` (camera whips), `glide` (travel), `punch`.
- `norm(t, a, b)` clamps progress; `pulse(t, at, decay)` decays after an event; `window01(...)`.
- `rng(seed)`, `noise1(x, seed)`: deterministic randomness and drift.
- DOM: `el(tag, class, parent)`, `css(node, styles)` (batched), `tf(node, { x, y, z, s, sx, sy,
  r, rx, ry, skx, sky, o, blur })`, `vis(node, bool)`, `setText(node, text)`,
  `icon(parent, 'trophy', 64, { stroke, width })` for Lucide icons as real SVG nodes (121 icons in
  `lib/icons.mjs`; add more by pasting Lucide child elements), `ensureStyle(id, cssText)` to
  register a block's stylesheet once.

## world3d.mjs

`createWorld(canvas, options)` draws glowing line art on a floor through a 3D camera. Options:

- `lines`: from `shapes.segment/polyline/rect/arc/circle(...)` or `makeLine(points, meta)`.
  Line meta: `mode` ('mid' grows from the middle, 'start' from the first point), `faint`,
  `dash` (dash length), `width` (world units), `color` (hex, overrides the accent).
- `fills`: `[{ pts, color, alpha }]` polygons on the floor (a floor surface, highlighted areas).
  `alpha` may be a function of t.
- `grid`: `{ x0, x1, y0, y1, step, alpha }` faint floor grid.
- `camera(t)`: return orbit params `{ tx, ty, dist, pitch, yaw, roll, fov }`. Build it with
  `cameraTrack({ dist: [[t, v, ease], ...], pitch: [...], ... }, { drift, shake: (t) => amp })`.
  pitch 90 looks straight down; yaw 0 faces +x and, from above, puts +x at the top of the frame.
- `reveal(line, t)`: draw-on progress; `reveals.fromCenter({ start, speed, dur })`, `reveals.at(time)`.
- `energy(t)`: glow multiplier; add beat pulses from `KICKS` so the world breathes with the music.
- `blend`: 'lighter' for dark brands, 'multiply' for light ones.
- `overlay(api, t)`: draw anything in world space each frame: `api.drawDisc(x, y, r, style)`,
  `api.drawRing(cx, cy, r, width, style)`, `api.drawLine(line, s0, s1, alpha, glow)`,
  `api.fillPoly(pts, style)`, `api.label(text, x, y, opts)`, `api.project([x, y, z])`. Whatever it
  returns is merged into the per-frame `frame` object that scenes receive (e.g. a screen position
  to launch a card from).

`project(cam, [x, y, z])` returns `{ x, y, k }` (screen point and pixels per world unit) or null.
`composeOverlays(a, b, ...)` runs several overlays and merges what they return.

## worlds.mjs presets

`dataGrid()` and `targetRings()`, both abstract so they suit any app. Each returns
`{ lines, fills, grid, bounds, landmarks }`; spread it into `createWorld`. `fitDistance(width,
height)` gives the top-down camera distance that frames a region in 9:16. For other domains,
build geometry from `shapes` (a candlestick skyline, a recipe card grid, a route map, a
blueprint of the product).

## kit.mjs

- Type: `splitChars`, `riseChars(chars, t, start, { stagger, dur, exitAt, exitDur })` (letters rise out of an
  `overflow: hidden` line), `fitText(node, maxWidth, maxSize)` (call after fonts load),
  `echoStack(parent, text)` (outlined echoes), `slamIn(t, at, 'zoom'|'left'|'right'|'up'|'down',
  { dur, ease })` returns transform params for a word landing on a beat (default `PACE.enter`
  with an `outQuart` settle; pass `{ dur: PACE.accent, ease: E.outExpo }` for an accent slam).
- Numbers: `roller(parent).set(4.5)` odometer digit; `slotNumber(parent).set(from, to, q)` slot
  counter that returns the rendered width so a label can hug it.
- Text: `typeInto(node, text, t, t0, t1, { placeholder })` with caret; `streamWords(node, text, t,
  t0, t1)` for AI answers; `shimmer(node, t)` for the thinking gradient (`.shimmer` class).
- Reveals: `circularReveal(node, { x, y }, origin, t, t0, dur)`.
- Floor decals: `placeOnFloor(node, cam, { w, h, worldW, center, angleDeg, z })` lays a DOM element
  on the world floor with a homography. Put the node in the `floor` layer. Use the final camera yaw
  for `angleDeg` so it reads upright; animate `z` down for a drop.
- AI motif: `orbCanvas(parent, px)` + `drawOrb(ctx, t, size)`.
- Feel: `pressScale(t, at)` (max 4% dip), `tapAt(node, t, at, x, y)` with a `.tap` element,
  `enterExit(t, inAt, outAt)`.

## fx.mjs

`fx.burst({ at, x, y, color, count, speed, spread, dir, life, gravity, size, seed })`,
`fx.flash({ at, color, strength, decay })`, `fx.streak({ at, dur, y, color, strength, dir })`.
Register effects once in a scene factory; they render themselves at the right times.

## boot.mjs and the scene contract

`boot({ duration, world, scenes, brandUrl?, vignette? })` loads `../../brand/brand.json`, sets CSS
variables (`--bg --panel --panel2 --ink --muted --line --accent --brand --brand-ink --positive
--warning --negative --font-display --font-body --display-weight --display-tracking
--display-case --radius`), loads fonts, builds layers, and exposes `window.seek`.

A scene factory is `(ctx) => ({ update(t, frame) })`, where ctx has `ui`, `floor`, `fx`, `brand`,
`asset(path)` (resolves brand asset paths), and `duration`. `frame` has `cam` plus anything the
world overlay returned. Build DOM once in the factory; only mutate in `update`. Hide scenes
outside their window with `vis(scene, on)` so off-screen work costs nothing.

Base classes in `kit.css`: `.scene .layer .abs .row .mask .display .eyebrow .num .shimmer .caret
.placeholder .panel .panel2 .pill(.good .bad .warn .accent) .btn(.ghost) .live-dot .digit .tap
.notif .bubble(.user .ai)`.

## synth.mjs

```js
const mix = createMix({ duration: grid.duration, seed: 7 });
mix.drums(grid, bar, 'trap' | 'phonk' | 'house' | 'drill' | 'lofi' | 'boombap' | 'dnb' | 'hyperpop' | 'four');
mix.kick(time, opts);                        // records the kick for sidechain ducking
mix.place(monoBuffer, time, { gain, pan, send, bus: 'dry' | 'duck', stem: 'music' | 'sfx' });
mix.placeStereo(inst.supersaw(chord, len, { cutoff }), time, { gain, send, bus: 'duck' });
mix.render('out/soundtrack.wav');            // also out/soundtrack-sfx.wav (no music stem)
```

Instruments (`inst.*`): `kick sub808 clap snare hat crash cowbell boom whoosh riser tick bell blip
swish vinyl supersaw stab pluck keys`. `PROGRESSIONS`: `epicMinor
darkPhonk upliftMajor lofiSevenths tenseDrill`. `noteHz(midi)`. Put UI sounds and impacts in the
`sfx` stem (default) and anything musical in `music`, so the SFX-only export works.

## CLIs (run inside the video folder)

```bash
node render.mjs sheet --step 0.25 [--from 3 --to 6] [--times 0.5,2,7.6] [--tile 216 --cols 10]
node render.mjs stills --times 0.6,8.8,14.9
node render.mjs preview --fps 30 --audio out/soundtrack.wav
node soundtrack.mjs out/soundtrack.wav && node analyze-audio.mjs out/soundtrack.wav "0-24"
node build.mjs            # soundtrack, 60 fps frames with 4x motion blur, encodes, covers, manifest
```

`build.mjs` writes `out/NNN-slug-9x16.mp4`, `-9x16-30fps.mp4`, `-4x5.mp4` (crop at `meta.crop45`),
`-9x16-sfx-only.mp4`, `cover-*.png` (at `meta.covers` seconds), and `manifest.json`, then deletes
the frames. Expect roughly 3 to 4 minutes of rendering plus encodes for 24 seconds on a modern
laptop; time scales with length.
