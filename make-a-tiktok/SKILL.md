---
name: make-a-tiktok
description: Make the next motion-graphics TikTok (also Reels and Shorts) for an app, as one run of a repeatable content engine. Builds or reuses the app's brand profile, reads every previous video script in the studio ledger and deliberately varies hook, format, feature, visual world, camera, music, and ending so the page never repeats itself, then scripts, animates (code-driven HTML composition rendered frame by frame with motion blur), scores (procedural soundtrack), renders 9:16 and 4:5 deliverables, and logs the result. Use for /make-a-tiktok, "make the next TikTok", "another video for the page", a promo or launch video for an app, or any looping social-content workflow, even when the user does not say TikTok.
argument-hint: "[idea, feature, length, series, or --studio <dir>]"
---

# Make a TikTok

One run makes one new, finished, varied video for an app's short-form page, and leaves the
studio ready for the next run, with a richer library of building blocks than it started with. The engine is code: an HTML composition driven by `seek(t)`,
captured frame by frame in headless Chrome with temporal motion blur, and a soundtrack
synthesized on the same beat grid. The ledger of previous scripts is what keeps a looping page
from making the same video twice; the block library is what makes each video faster than the
last.

Resolve `scripts/`, `references/`, `template/`, and `engine/` against this skill's directory
(call it `$SKILL`). Commands below use `studio` as shorthand for
`node $SKILL/scripts/studio.mjs` (it finds the studio from the working directory, or takes
`--studio <dir>`).

## Pace comes first

A video a viewer cannot follow gets scrolled past no matter how good it looks, so every run works
in this order: each scene is understood on the first watch, then the video looks great, then it
is short. Length follows the content and always stays under 45 s; most land between 20 and 35 s.
One idea per scene, and each scene gets 1.5 s plus 0.3 s per word of on-screen copy (the checker
enforces this from `meta.json` `scenes`). Transitions take 0.4 to 0.8 s and key lines hold still
for at least 1.2 s. Fast snaps and whips are accents for one or two moments, not the way every
scene changes. Punch comes from contrast (stillness, then impact), not from speed. Details are in
`references/motion-craft.md`, "Pace and comprehension".

## What a run produces

In `<studio>/videos/NNN-slug/`: `script.md` (the creative script), `meta.json` (ledger entry:
axes, copy, claims, outputs), `post.md` (caption and upload notes), the composition source,
and `out/` with `NNN-slug-9x16.mp4` (1080x1920, 60 fps, -14 LUFS), `-9x16-30fps.mp4`,
`-4x5.mp4`, `-9x16-sfx-only.mp4` (for adding a trending sound in-app), `cover-*.png`, and
`manifest.json`. The studio's `LEDGER.md` gains a row.

## Workflow

### 1. Preflight and studio

Run `studio doctor` on a new machine or after a failed render: it checks Node 18+, ffmpeg,
Chrome, and the skill's bundled `playwright-core` (run `npm install` in `$SKILL` if missing).
After any change to `$SKILL/engine` or `$SKILL/blocks`, run `studio selftest --blocks`.

Run `studio status`. A studio is a folder with `studio.json`, `brand/`, `videos/`, and
`LEDGER.md`; by default it lives at `<repo>/marketing/tiktok` for the app repository you are in.
If none exists, create one with `studio init --app <slug> --name "<App>"` and build the brand
profile by reading the app (read `references/brand-profile.md` first). Building the brand
profile is a one-time investment per app; do it thoroughly (real tokens, fonts, logo file, 5 to
12 features with proof lines, 4 to 8 personas, voice rules). Without an app repository or
website to read, stop and ask for one rather than inventing a brand.

If `status` lists a video as IN PROGRESS, resume that video instead of starting another. Look at
what exists (script, scenes, out/) and continue from the first unfinished step.

### 2. Study what has been made

Run `studio history --last 12` and `studio axes`, then read the last three `script.md` files in
full. Write down, for yourself, what a regular viewer of this page has already seen too often:
story shapes, signature moves, product surfaces, emotional register, first-frame compositions.
Read `references/variation-playbook.md` before choosing.

Then take stock of what you can build with: `studio blocks` (the catalog; `*` marks signature
blocks to rotate), saved formats, and both lessons files (`<studio>/LEARNINGS.md` and
`$SKILL/LEARNINGS.md`). A concept that reuses existing blocks for its mechanics and spends its
effort on the new idea is both faster and better.

### 3. Choose the next video

Run `studio suggest --n 6` (add `--fix feature=<id>` or `--series <id>` when the user asked for
something specific; user arguments always take priority). Weigh the suggestions against open
backlog ideas and the user's request, then write a one-sentence concept: a specific persona, a
specific moment, a specific product proof, a format, a world, a camera language, a sound, an
ending. Choose deliberately; a suggestion is a starting point, and any axis may change as long as
the check passes. If the page has performance data, `suggest` already mixes proven values with
exploration; respect that balance.

### 4. Script and check

Run `studio new --slug <kebab-slug> --title "<title>"` to scaffold the folder from the template
and a snapshot of the block library. Add `--format <id>` to start from a saved format instead
(ideal for a series episode; the variation rules still stop a format from following itself).
Fill `script.md` (every section; see `references/script-format.md`) and `meta.json` (axes,
`hook_line`, `scenes` with each scene's window and on-screen copy, `features`, `claims`,
`length`/`bpm`/`bars`, `covers`, and `blocks_planned`). Plan the scenes before the music: give each
scene the time its copy needs, then pick bars and BPM around the total. Then run
`studio check <id>`. Treat a FAIL as a creative note: change the idea until it passes, not just
the words. A pace FAIL means a scene has more copy than time; give it more bars or cut words, and
never answer it by speeding up the motion. Mark progress with `studio log <id> --status building`.

### 5. Build the picture

The scaffold is a working, brand-driven 24 s piece: six 4 s scenes (hook, three features, payoff,
logo end card) at a readable pace.
It exists to prove the pipeline on this machine and to demonstrate the patterns; it is not a
structure to keep. A countdown, a quiz, a POV story, and a data story have different shapes, so
restructure the acts to match the script. If this video's scene list reads like the previous
video's, it is the same video with new words. Rewrite:

- `src/cues.mjs`: `beatGrid(bpm, bars)`, every cue as `b(n)`, and the `KICKS` list. Scene
  windows match `meta.json` `scenes`; a scene's `out` cue is when it is fully gone.
- `src/copy.mjs`: every on-screen string (keep it identical to the copy in `meta.json` `scenes`).
- `src/world.mjs`: a world preset or custom geometry that fits the app's domain, and camera
  tracks planned beat by beat.
- `src/scenes.mjs` (split into files freely): one factory per act, assembled from the blocks in
  `blocks/` wherever they fit (`studio blocks show <id>` for params, `studio blocks demo <id>` to
  see one). When the concept needs something new that could recur (a component, a transition, a
  world overlay, a music bed), build it as a block in `blocks/<new-id>/` rather than inline scene
  code, and extend existing blocks with backward-compatible params when they almost fit. That is
  how the next video gets faster.

Read `references/building-blocks.md` before creating or extending a block,
`references/engine-api.md` for the API, and `references/motion-craft.md` for layout, type,
rhythm, transitions, and the pitfalls list before writing scenes. Review constantly with
`node render.mjs sheet --step 0.25` and `node render.mjs stills --times ...` and look at every
image you render. Fix what you see: empty or illegible first frames, text outside the safe zone,
overlapping transitions, pops, off-brand color. Then watch `node render.mjs preview` once at full
speed, sound off, without pausing, and say what each scene told you. If a scene needs a pause or
a second look to read, it needs more time or less copy.

### 6. Build the sound

Rewrite `soundtrack.mjs` for the chosen music axis and sync every visual hit to a sound
(`references/sound-design.md`). The `arrangement-build-drop` block gives you a music bed in any
genre in one call; spend the effort on the sound design. Render it with `node soundtrack.mjs out/soundtrack.wav`, check
balance with `node analyze-audio.mjs out/soundtrack.wav "0-<len>"`, and view a spectrogram to
confirm hits line up with cues. Put musical parts in the `music` stem and effects in `sfx`.

### 7. Render and verify

Run `node build.mjs` (roughly 4 to 8 minutes for 20 to 35 s). It renders 60 fps frames with 4x motion blur,
normalizes audio to -14 LUFS, encodes every deliverable, exports covers, writes
`out/manifest.json`, and deletes the frames. Then verify: read the manifest (1080x1920, 60 fps,
expected frame count, loudness near -14 and peak under -1), view the covers, and view a contact
sheet of the final MP4 (`ffmpeg -i out/<name>-9x16.mp4 -vf "select='not(mod(n\,30))',scale=180:320,tile=10x3" -frames:v 1 out/final-sheet.png`).
Work through the QA checklist in `references/motion-craft.md`.

### 8. Package and log

Write `post.md` (template in `references/script-format.md`), make sure `meta.json` still
matches what was rendered, then:

1. `studio harvest <id>` promotes every new or improved block this video used into the library
   (generic ones into the skill for every app, app ones into the studio). Add `--format` when this
   video introduced a story shape worth repeating. Fix anything it rejects and harvest again.
2. `studio learn "<lesson>" --video <id>` for each thing that cost real time (add
   `--scope engine` for engine or block behavior), so the next run avoids it.
3. `studio log <id> --status rendered` (records outputs from the manifest) and
   `studio check <id>` once more.

If the studio sits inside a repository with lint or doctor gates that scan it, run them and fix
what they report.

### 9. Report

Send the user a short brief, not the whole script:

- The hook line and the one-sentence concept.
- Why it is different: the axes that changed versus recent videos (by id) and the new signature
  move.
- Where the files are, with the main MP4 path first. If a file-sharing tool is available, send the
  9:16 MP4.
- What was verified (specs, loudness) and the caveats: you cannot hear the audio, and example
  data is illustrative.
- What the library gained: blocks added or improved, and any format saved.
- The best next idea for the following run (add it with `studio backlog add`).
- A reminder that after posting, `studio log <id> --status posted --views N --completion 0.x ...`
  feeds real performance back into future suggestions.

## Running unattended

The user can loop this skill (for example `/loop 24h /make-a-tiktok`, or a scheduled task that
runs it inside the app repository). Each run is self-contained: it resumes unfinished work first,
otherwise makes exactly one new video, updates the ledger, and stops. Nothing carries over in
conversation memory; everything a later run needs is in the studio (ledger, scripts, backlog,
brand profile), so write decisions down there.

## Rules that keep the engine healthy

- One new video per run. Loops depend on each run finishing cleanly and leaving no half-built work.
- Always study history and pass `studio check` before building. Variation is the product; a
  skipped check is how a page starts repeating itself.
- Never post, upload, schedule, or message on the user's behalf. Publishing is the user's call;
  prepare `post.md` and stop.
- Stay honest: show only what the product really does, keep example data plausible and labeled
  illustrative in the caption, no fake testimonials, no invented metrics, no competitor logos,
  no real people's likenesses.
- Keep frames deterministic (no wall-clock time, no `Math.random`, no CSS animations); the
  renderer captures frames out of order in parallel workers.
- Only touch the studio folder. Do not modify the app's source, and do not commit unless asked.
- When unattended (in a loop), do not stop to ask questions; decide, and record each decision in
  the script's Decisions section. Ask only when you are blocked on something only the user can
  provide (an app to read, brand assets you may not download).
- If a step fails twice after fixing, set `studio log <id> --status failed --note "<cause>"`,
  report the cause, and stop rather than spinning. Failed videos free their ideas for later runs.
- Keep disk use bounded: `build.mjs` deletes frames; do not keep extra renders around.
- Keep it comprehensible. Under 45 s, one idea per scene, time to read every line. Never speed
  a video up to fit a length; cut an idea instead.
- Leave the library richer. Reuse blocks for mechanics, never for stories; build anything
  reusable as a block; harvest after every render. A run that rebuilds an existing block from
  scratch wasted the previous runs' work.

## Reference files

- `references/variation-playbook.md`: the selection loop, reading history, concept recipe, hook
  examples, signature moves to rotate, series, performance data, angle generators, honesty.
- `references/motion-craft.md`: pace and comprehension (read first), safe zones, type sizes,
  rhythm, camera, transitions, brand fidelity, pitfalls, review loop, QA checklist.
- `references/building-blocks.md`: where blocks live, reuse versus extend versus create, block
  anatomy and conventions, generic versus app scope, harvesting, formats, signature blocks,
  learnings upkeep.
- `references/engine-api.md`: the `lib/` API (core, world3d, worlds, kit, fx, boot, synth) and
  the render/build CLIs.
- `references/sound-design.md`: beat math table, genre recipes, sync map, stems, mix targets.
- `references/brand-profile.md`: building `brand.json` from a repository or website.
- `references/script-format.md`: meta.json fields, script.md sections, post.md, and the DraftKit
  #001 summary.
- `blocks/CATALOG.md` and `LEARNINGS.md` (in `$SKILL` and in each studio): the current library
  and the accumulated lessons.
- `examples/draftkit-001/`: the complete source and script of the first DraftKit video, for
  studying how a finished piece is built. Its parts now live on as blocks; learn its techniques,
  do not copy its story or look.
