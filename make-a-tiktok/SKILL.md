---
name: make-a-tiktok
description: Make the next motion-graphics TikTok (also Reels and Shorts) for an app, as one run of a repeatable content engine. Builds or reuses the app's brand profile (real screens, its own looks and formats, a sonic identity), studies every previous video in the studio ledger and what was made for other apps on this machine, and deliberately varies idea, structure, look, and sound so no two videos rhyme. Each video gets its own designed sound kit (instruments, key, groove, arrangement shape) around the app's sonic logo. Then it scripts, animates (code-driven HTML composition rendered frame by frame with motion blur), scores, critiques its own frames in scored rounds, renders 9:16 and 4:5 deliverables, and logs the result. Use for /make-a-tiktok, "make the next TikTok", "another video for the page", a promo or launch video for an app, or any looping social-content workflow, even when the user does not say TikTok.
argument-hint: "[idea, feature, length, series, or --studio <dir>]"
---

# Make a TikTok

One run makes one new, finished video for an app's short-form page, unlike the ones before it, and
leaves the studio ready for the next run. The engine is code: an HTML composition driven by
`seek(t)`, captured frame by frame in headless Chrome with temporal motion blur, and a soundtrack
synthesized on the same beat grid.

Resolve `scripts/`, `references/`, `template/`, and `engine/` against this skill's directory
(call it `$SKILL`). Commands below use `studio` as shorthand for
`node $SKILL/scripts/studio.mjs` (it finds the studio from the working directory, or takes
`--studio <dir>`).

Work at high reasoning effort for a new video. The prompt is a small part of the result; the
harness is most of it: real assets, a named look, a designed sound, and looking at your own frames
until they are good.

The user's whole job is to call this skill. Everything else is the run's job: installing the
renderer's dependency, building or completing the brand profile, capturing screens, finding the
other studios on the machine, bringing older videos up to date, designing the sound, critiquing,
rendering, and logging. `studio status` does the housekeeping and prints a DO NOW list; work
through it yourself. Never hand a setup step, a command to run, or a choice of axes back to the
user. Ask only for what cannot be found or made: an app to read when there is none, or brand
assets you may not download.

## Two things come first

**Pace.** A video a viewer cannot follow gets scrolled past no matter how good it looks, so every
scene is understood on the first watch, then the video looks great, then it is short. Length
follows the content and always stays under 45 s. One idea per scene, and each scene gets 1.5 s
plus 0.3 s per word of on-screen copy (the checker enforces this from `meta.json` `scenes`).
Transitions take 0.4 to 0.8 s and key lines hold still for at least 1.2 s. Punch comes from
contrast (stillness, then impact), not from speed. Details: `references/motion-craft.md`, "Pace
and comprehension".

**Difference.** Left alone, every run drifts to the same video: a line of type, a walk through
the product, a payoff line, a logo with a tagline and a button, over a build and a drop. Those are
defaults, and a default is what a page looks like when nobody chose. Difference is built from five
sources, and the checker enforces each:

- **The app.** What only this app can show (`brand.json` `identity.only_here`), its real screens,
  its own looks and formats (`axes.add`), its sonic logo. A video that could carry another app's
  logo has not used the brand profile.
- **The ledger.** Every previous video here: axes, scene rhythm, blocks, look, new moves, sound
  kit, and a measured fingerprint of the rendered soundtrack.
- **The portfolio.** Videos made on this machine for other apps. A first video for a new app must
  not rhyme with the last video made for a different one, and a value that most recent videos
  landed on (an end card with a URL button, say) is ruled out until something else has been used.
- **A reference.** A named look with something to point at beats a description.
- **The sound kit.** Instruments, key, chords, groove, arrangement shape, and sound-design voices
  designed per video, around the app's own motif.

## What a run produces

In `<studio>/videos/NNN-slug/`: `script.md` (the creative script), `meta.json` (ledger entry:
axes, scenes, look, sound kit, new moves, review rounds, outputs), `review.md` (the critique log),
`post.md` (caption and upload notes), `sheet.jpg` (a strip of the finished video that later runs
look at), the composition source, and `out/` with `NNN-slug-9x16.mp4` (1080x1920, 60 fps,
-14 LUFS), `-9x16-30fps.mp4`, `-4x5.mp4`, `-9x16-sfx-only.mp4` (for adding a trending sound
in-app), `cover-*.png`, `contact.png`, `phone/`, and `manifest.json`. The studio's `LEDGER.md`
gains a row and the portfolio gains an entry.

## Workflow

### 1. Preflight and studio

Run `studio status`. If it or a render reports a missing tool, run `studio doctor --fix`: it
checks Node 18+, ffmpeg, and Chrome, and installs the skill's bundled `playwright-core` itself.
After any change to `$SKILL/engine` or `$SKILL/blocks`, run `studio selftest --blocks`.

A studio is a folder with `studio.json`, `brand/`, `videos/`, and `LEDGER.md`; by default it lives
at `<repo>/marketing/tiktok` for the app repository you are in. If none exists, create one with
`studio init --app <slug> --name "<App>"` and build the brand profile by reading the app (read
`references/brand-profile.md` first). Without an app repository or website to read, stop and ask
for one rather than inventing a brand.

On every run, `status` does three things on its own, so nobody has to:

- It brings videos made by an older version of the skill up to date (a strip of frames and a
  measured fingerprint of the soundtrack).
- It records this studio in the portfolio and finds the other studios on the machine (the
  repositories next to this one, and their worktrees), reading them without changing them.
- It prints **DO NOW**: what the brand profile still lacks. `studio profile` prints the same list
  with how to close each item.

Close every DO NOW item yourself, in this run, before choosing a video. They are where
personalization comes from, and `studio suggest` and `studio check` refuse to proceed until the
list is empty:

- Real tokens, fonts, and logo; 5 to 12 features with proof lines; 4 to 8 personas; voice rules.
- What only this app can show, and the moments people reach for it (`identity`).
- Two or more looks and one or more formats of its own (`axes.add`), and the shared values that
  are wrong for it removed (`axes.remove`).
- The instrument families that suit it and the ones to avoid (`sound`).
- Real product screens: `studio capture --url ...` against the brand's site or a local dev server,
  or screenshots already in the repository. If the product truly cannot be reached, record why in
  `surfaces_unavailable` and mirror its real components.
- `brand/style_guide.md`, written from those screens and the app's own marketing.
- For videos that predate the newer fields: their `opening`, `register`, and `look`, read off
  their scripts and strips.

List what you found before you animate anything. This is a one-time investment per app; later runs
find the list empty and go straight to step 2.

If `status` lists a video as IN PROGRESS, resume that video instead of starting another. Look at
what exists (script, scenes, out/) and continue from the first unfinished step.

### 2. Study what has been made

Run `studio history --last 12` and `studio axes`, then read the last three `script.md` files in
full. `history` also lists what was made for other apps on this machine and the defaults those
videos share. Then run `studio gallery` and look at the image: one row of twelve frames per recent
video. Write down what a regular viewer has seen too often, and what the rows have in common:
first frame, layout, how text enters, where the product sits, how they end, how the palette is
used. That list is what this video must not do. Read `references/variation-playbook.md` before
choosing.

Then take stock of what you can build with: `studio blocks` (the catalog; `*` marks signature
blocks to rotate), saved formats, the brand's real screens and references (`studio refs`), and both
lessons files (`<studio>/LEARNINGS.md` and `$SKILL/LEARNINGS.md`).

### 3. Choose the next video

Run `studio suggest --n 6` (add `--fix feature=<id>` or `--series <id>` when the user asked for
something specific; user arguments always take priority). Each suggestion is a full set of axes
that already passes the rules, with a scene skeleton from its format, a tempo, and a designed
sound kit. Weigh them against open backlog ideas and the user's request, then write:

- A logline: one sentence that names a specific persona, a specific moment, and a specific proof
  that only this app can show. Every later decision is checked against it.
- The look, by name, with a reference: a frame, a video, a brand surface, or a named style
  (`meta.json` `look`). Say what you take from it and what you leave.
- At least one new move: something this page has not shown (a transition, a component, a camera
  idea). It goes in `meta.json` `new_moves`.

Choose deliberately; a suggestion is a starting point, and any axis may change as long as the
check passes. If the page has performance data, `suggest` already mixes proven values with
exploration; respect that balance.

### 4. Script and check

Run `studio new --slug <kebab-slug> --title "<title>" --pick <n> --seed <seed>` to scaffold from
the suggestion you chose (or `--axes hook=...,format=...` to set axes yourself, or `--format <id>`
to start from a saved format). It writes the axes, the scene skeleton, the tempo, and the sound kit
into `meta.json`.

Fill `script.md` (every section; see `references/script-format.md`) and `meta.json`: `hook_line`,
`logline`, `look`, `scenes` with each scene's window and on-screen copy, `new_moves`, `features`,
`claims`, `covers`, and `blocks_planned`. Write the scenes as a state list (what is on screen in
each state and what drives the change), not as a mood. Plan the scenes before the music: give each
scene the time its copy needs, then fit bars and BPM around the total.

Run `studio sound <id>` whenever the axes or tempo change (`--reroll` for another kit, `--set
lead=whistle,shape=pulse` to adjust one). It designs a kit that differs from recent videos and
from other apps, prints it, and stores it in `meta.json` `sound`.

Then run `studio check <id>`. Treat a FAIL as a creative note: change the idea until it passes,
not just the words. A pace FAIL means a scene has more copy than time; give it more bars or cut
words, and never answer it by speeding up the motion. Mark progress with
`studio log <id> --status building`.

### 5. Build the picture

The scaffold is a working 24 s piece that proves the pipeline on this machine and demonstrates the
patterns. It is not a structure to keep, and the checker fails a video that still has the
scaffold's scene list, its four blocks together, or its untouched source files. Rewrite:

- `src/cues.mjs`: `beatGrid(bpm, bars)` to match `meta.json`, every cue as `b(n)`, `SOUND` (groove
  and shape from the kit, plus the bar where the story turns and the bar of the final chord), and
  `KICKS`.
- `src/copy.mjs`: every on-screen string (identical to the copy in `meta.json` `scenes`).
- `src/world.mjs`: the world for this look, and camera tracks planned beat by beat. Not every
  video needs the 3D line-art world; a paper collage, a single object, or real screens are worlds
  too.
- `src/scenes.mjs` (split into files freely): one factory per act. Reuse blocks for mechanics
  (`studio blocks show <id>`, `studio blocks demo <id>`), and build what this concept needs as new
  blocks in `blocks/<new-id>/`. Show the real product: place captured screens from
  `brand.surfaces` and animate crops, a cursor, and callouts on them, or mirror the app's real
  components faithfully. Never redraw product UI from imagination.

Read `references/motion-craft.md` before writing scenes (pace, the banned defaults, springs,
transitions, pitfalls), `references/building-blocks.md` before creating or extending a block, and
`references/engine-api.md` for the API. Build in gates and do not skip one:

1. Stills: `node render.mjs stills --times ...` for the key frame of every scene. Fix composition
   before anything moves.
2. Animatic: `node render.mjs sheet --step 0.5`, then `node render.mjs preview` once the sound
   exists. Fix pacing before polish.
3. Polish: transitions frame by frame with `node render.mjs sheet --from A --to B --step 0.033`.

### 6. Build the sound

Rewrite `soundtrack.mjs` around the kit (`references/sound-design.md`). The `arrangement-shapes`
block plays the bed in the kit's shape (a build and a drop is one of seven); `kit.sfx` gives
impacts, moves, ticks, and confirmations in this video's voice; `kit.playMotif` plays the app's
sonic logo. Sync every visual hit to a sound. Render with `node soundtrack.mjs out/soundtrack.wav`,
check balance with `node analyze-audio.mjs out/soundtrack.wav "0-<len>"`, and view a spectrogram
to confirm hits line up with cues. Put musical parts in the `music` stem and effects in `sfx`.

When the user supplied a track they may post with, measure it (`node beats.mjs <file>`) and cut to
its beats instead of synthesizing a bed. A voiceover or a talking character is an option only when
the user provided a voice tool or key; see `references/sound-design.md`.

### 7. Critique in rounds

You can read images, so look at what you made, as a harsh motion director rather than a proud
author. Each round:

1. Render the material: `node render.mjs sheet --step 0.5` (the whole piece),
   `node render.mjs sheet --from A --to B --step 0.033` around every fast move, a few stills at
   full size, `studio sheet <id>` then `studio gallery` (this video next to the recent ones).
2. Score 1 to 10: hook in the first 2 s, readability at phone size, motion quality, variety
   (something new every 2 to 4 s), composition, brand accuracy, sound sync, and distinctness from
   the gallery.
3. List the three biggest problems with timestamps. Hunt for the usual ones
   (`references/motion-craft.md`, "Critique"): text overlapping during a swap, anything sliding
   instead of settling, a dead beat, blurry scaled text, a first frame that says nothing, a look
   that matches the row above it in the gallery.
4. Record it: `studio review <id> --scores hook=7,read=8,motion=7,variety=6,composition=8,brand=9,sync=8,distinct=7 --problems "0:04 ...; 0:12 ...; 0:20 ..."`.
5. Fix those three, re-render the affected seconds, and go again.

A video is finished after at least two rounds with every score at 8 or more; `studio log
--status rendered` refuses otherwise. Iteration is the method, not a failure.

### 8. Render and verify

Run `node render.mjs verify` (frames must not depend on capture order), then `node build.mjs`
(roughly 4 to 8 minutes for 20 to 35 s). It renders 60 fps frames with 4x motion blur, normalizes
audio to -14 LUFS, encodes every deliverable, exports covers, writes `out/contact.png` and
`out/phone/` (one frame per scene at the 360 px a phone shows), and for a seamless loop
`out/seam.png` and `out/loop-check.mp4`. Then verify: read the manifest (1080x1920, 60 fps,
expected frame count, loudness near -14 and peak under -1), and view the covers, the contact
sheet, and every phone frame. If text cannot be read at phone width, it is too small. Work through
the QA checklist in `references/motion-craft.md`.

### 9. Package and log

Write `post.md` (template in `references/script-format.md`), make sure `meta.json` still
matches what was rendered, then:

1. `studio harvest <id>` promotes every new or improved block this video used into the library
   (generic ones into the skill for every app, app ones into the studio). Add `--format` when this
   video introduced a story shape worth repeating. Fix anything it rejects and harvest again.
2. `studio learn "<lesson>" --video <id>` for each thing that cost real time (add
   `--scope engine` for engine or block behavior), so the next run avoids it.
3. `studio log <id> --status rendered` records outputs from the manifest, saves `sheet.jpg`,
   fingerprints the soundtrack, and adds the video to the portfolio. Then `studio check <id>` once
   more: it now compares the measured soundtrack with earlier ones.

If the studio sits inside a repository with lint or doctor gates that scan it, run them and fix
what they report.

### 10. Report

Send the user a short brief, not the whole script:

- The hook line and the logline.
- Why it is different: the axes that changed versus recent videos (by id), the look and its
  reference, the new move, and the sound kit in a line (family, shape, key, lead).
- Where the files are, with the main MP4 path first. If a file-sharing tool is available, send the
  9:16 MP4.
- What was verified (specs, loudness, review scores, how close the soundtrack measures to the
  nearest earlier one) and the caveats: you cannot hear the audio, and example data is
  illustrative.
- What the library gained: blocks added or improved, and any format saved.
- The best next idea for the following run (add it with `studio backlog add`).
- A reminder that after posting, `studio log <id> --status posted --views N --completion 0.x ...`
  feeds real performance back into future suggestions.

## Running unattended

The user can loop this skill (for example `/loop 24h /make-a-tiktok`, or a scheduled task that
runs it inside the app repository). Each run is self-contained: it resumes unfinished work first,
otherwise makes exactly one new video, updates the ledger, and stops. Nothing carries over in
conversation memory; everything a later run needs is in the studio (ledger, scripts, sheets,
backlog, brand profile) and the portfolio, so write decisions down there.

## Rules that keep the engine healthy

- One new video per run. Loops depend on each run finishing cleanly and leaving no half-built work.
- Always study history, look at the gallery, and pass `studio check` before building. Variation is
  the product; a skipped check is how a page starts repeating itself.
- Never keep a default because it is there. The scaffold's structure, a logo end card with a URL
  button, a build and a drop, a line of type over the world as the first frame: each is allowed
  only when chosen against the alternatives, and never twice in a row.
- Show the real product. Real screens, real logo, real colors and fonts; mock only what the UI
  actually does.
- Never post, upload, schedule, or message on the user's behalf. Publishing is the user's call;
  prepare `post.md` and stop.
- Stay honest: show only what the product really does, keep example data plausible and labeled
  illustrative in the caption, no fake testimonials, no invented metrics, no competitor logos,
  no real people's likenesses, no music the user has no right to post.
- Keep keys out of files and chat. If a voice or image tool needs one, read it from the
  environment by name.
- Keep frames deterministic (no wall-clock time, no `Math.random`, no CSS animations); the
  renderer captures frames out of order in parallel workers.
- Only touch the studio folder. Do not modify the app's source, and do not commit unless asked.
- Do not stop to ask questions, attended or not; decide, and record each decision in the script's
  Decisions section. Do not end a run by listing steps for the user to take: if a step can be
  done from here, it is yours. Ask only when you are blocked on something only the user can
  provide (an app to read, brand assets you may not download).
- If a step fails twice after fixing, set `studio log <id> --status failed --note "<cause>"`,
  report the cause, and stop rather than spinning. Failed videos free their ideas for later runs.
- Keep disk use bounded: `build.mjs` deletes frames; do not keep extra renders around.
- Keep it comprehensible. Under 45 s, one idea per scene, time to read every line. Never speed
  a video up to fit a length; cut an idea instead.
- Leave the library richer. Reuse blocks for mechanics, never for stories; build anything
  reusable as a block; harvest after every render.

## Reference files

- `references/variation-playbook.md`: the selection loop, reading history and the gallery, the
  defaults to break, from axes to a logline, naming the look, formats as state lists, signature
  moves, series, performance data, angle generators, honesty.
- `references/motion-craft.md`: pace and comprehension (read first), banned defaults, safe zones,
  type sizes, rhythm, springs, camera, transitions, brand fidelity, pitfalls, critique rounds, QA
  checklist.
- `references/sound-design.md`: sound kits and families, arrangement shapes, beat math, the sync
  map, the sonic logo, supplied tracks, voice, stems, mix targets, measured similarity.
- `references/brand-profile.md`: building `brand.json` from a repository or website: tokens,
  real screens, identity, the app's own catalog, sonic identity, references and the style guide.
- `references/building-blocks.md`: where blocks live, reuse versus extend versus create, block
  anatomy and conventions, generic versus app scope, harvesting, formats, signature blocks,
  learnings upkeep.
- `references/engine-api.md`: the `lib/` API (core, world3d, worlds, kit, fx, boot, synth,
  soundkit, grooves) and the render, build, audio, and beats CLIs.
- `references/script-format.md`: meta.json fields, script.md sections, review.md, post.md, and the
  DraftKit #001 summary.
- `blocks/CATALOG.md` and `LEARNINGS.md` (in `$SKILL` and in each studio): the current library
  and the accumulated lessons.
- `examples/draftkit-001/`: the complete source and script of the first DraftKit video, for
  studying how a finished piece is built. Its parts now live on as blocks; learn its techniques,
  do not copy its story or look.
