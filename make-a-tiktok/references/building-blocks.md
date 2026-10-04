# Building blocks

Every run should leave the library richer than it found it, so later videos assemble from proven
parts instead of rebuilding them. Blocks carry mechanics (a card, a counter, a transition, a world
overlay, a music bed). Stories, copy, and signature choices still change every video.

## Contents

- Where blocks live
- Reuse, extend, or create
- Anatomy of a block
- Scope: generic or app
- Harvesting
- Formats
- Signature blocks
- Learnings
- Engine fixes versus blocks

## Where blocks live

- Generic blocks: `$SKILL/blocks/<id>/`. Shared by every studio and every app.
- App blocks: `<studio>/blocks/<id>/`. Encode one app's UI patterns and data shapes.
- Formats: `<studio>/formats/<format>/`. A whole video's `src/` and `soundtrack.mjs` saved as a
  starting skeleton.
- Every scaffolded video gets a snapshot of both block libraries in its own `blocks/` folder, so a
  finished video keeps rendering the same way even after the library evolves.
- Catalogs regenerate automatically: `$SKILL/blocks/CATALOG.md` and `<studio>/blocks/CATALOG.md`.

## Reuse, extend, or create

Before building anything, run `studio blocks` (one line per block), `studio blocks show <id>`
(params and usage), and `studio blocks demo <id>` (renders a contact sheet with this studio's
brand; view it). Then, in order of preference:

1. Reuse: call the block with new params and new copy.
2. Extend: when a block almost fits, add a param with a default that preserves current behavior.
   Old call sites keep working. Edit the copy inside the video's `blocks/` folder; harvest carries
   the improvement back.
3. Create: when the script needs something that could plausibly appear in another video, build it
   as a new block in the video's `blocks/<new-id>/`, not as inline scene code. One-off layout glue
   and copy stay in `src/`.

Good block candidates: product UI components (cards, tables, charts, chat, phone frames,
notifications), stages for real screenshots (crop, pan, callouts, a cursor), text effects (rises,
slams, counters), transitions (irises, split wipes, shared-element flights, morphing containers),
world overlays (scans, route draws, heatmaps), whole looks as world blocks (paper, a wall, a
desk), and sound recipes (a domain sound, an arrangement shape).

Reuse is for mechanics, not for the look. `studio check` fails a video whose visual blocks are
more than 70 percent the previous video's, and one that uses the scaffold's four blocks together
(`rise-headline`, `feature-beats`, `payoff-words`, `logo-floor-drop`). When a concept leans on
the same blocks as last time, restyle them through params, replace some, or build this video's
own. Many generic blocks began as one app's UI (a scoreboard, a ranked table, a chat); on another
app, prefer an app block that mirrors that app's real screens.

## Anatomy of a block

```
blocks/<id>/
  index.mjs     the implementation
  block.json    catalog entry
  preview.png   optional, written by `studio blocks demo <id> --save`
```

`index.mjs` exports one of these entry points:

- Components: `create(ctx, params)` returning `{ root, update(t, frame) }`. A block can be passed
  straight to `boot` as a scene: `scenes: [(ctx) => block.create(ctx, params)]`.
- World overlays: `createOverlay(ctx, params)` returning `(api, t) => extraFrameFields`. Combine
  several with `composeOverlays(...)` from `lib/world3d.mjs`.
- Worlds: `geometry(params)` returning `{ lines, fills, grid, bounds, landmarks }`.
- Sound: `arrange(mix, grid, params)` (Node, used from `soundtrack.mjs`). Take the video's `kit`
  as a param and play its instruments (`kit.chord`, `kit.bass`, `kit.groove`) rather than fixed
  ones, as `arrangement-shapes` does; `arrangement-build-drop` is the older fixed-instrument bed.

Plus, for anything visual, a demo so the catalog can show it: `export const DEMO_LEN` (seconds),
`export function demo(ctx)` (a `create` call with sample params on a 0..DEMO_LEN timeline), and
optionally `DEMO_CAMERA` and `demoOverlay(ctx)` for overlays.

Conventions (they are what make blocks safe to reuse):

- All timing comes from `params.cues`, as absolute seconds from the video's cue map. `cues.out`
  (or `end`) is the moment the block is fully gone: its exit runs over the `PACE.exit` seconds
  before it, so a scene can set `out` to the next scene's start.
- Transition durations come from `PACE` (`lib/core.mjs`), merged with a `pace` param
  (`const P = { ...PACE, ...pace }`). Readable by default: entrances about 0.5 s, exits about
  0.4 s, staggers about 0.14 s. Default cues and the demo leave time to read every line.
- All copy comes from params. Never hardcode product text in a generic block.
- Colors come from CSS variables (`var(--accent)`) or `ctx.brand.tokens`.
- Styles go through `ensureStyle('<id>', cssText)` with classes prefixed `.b-<id>`. Scope color
  rules so they cannot override utility classes (a block rule once turned outlined echo text solid).
- Build DOM with `el()`, `textContent`, and `icon()`. No `innerHTML` with dynamic values.
- Deterministic: no wall-clock time, no `Math.random` (use `rng(seed)`).
- Layout params (`layout: { top, left, ... }`) default to safe-zone positions.
- Fit display text with `fitText` so wide brand fonts cannot overflow the frame.
- Exits finish before the block hides; opacity and blur go on leaves, never on a 3D parent.
- Imports stay inside the video: `../../lib/*.mjs` and `../<other-block>/index.mjs`. Never
  import from `../../src/`.

`block.json`:

```json
{
  "id": "countdown-ring",
  "name": "Countdown ring",
  "kind": "component",
  "scope": "generic",
  "signature": false,
  "summary": "One or two sentences a future run can scan in a catalog line.",
  "params": { "cues": "{ from, to }", "layout": "{ top, left, size }" },
  "usage": "import * as ring from '../blocks/countdown-ring/index.mjs';\nring.create(ctx, { cues: { from: CUE.a, to: CUE.b } });",
  "version": 1,
  "origin": "draftkit #004",
  "changelog": []
}
```

`kind` is one of `component`, `overlay`, `transition`, `world`, `sound`, `motion`.

## Scope: generic or app

A block is `generic` when it works for any brand: no brand names, no product copy, no brand colors
except through tokens. It lands in the skill and every app benefits. A block is `app` when it
encodes one app's surface (for example a category scoreboard laid out exactly like the app's
matchup screen). When in doubt, make the block generic and move app details into params.

## Harvesting

After the final build, run `studio harvest <id>` (add `--dry-run` to preview). It:

- finds the blocks the video imports (including blocks those import);
- promotes every new or changed block that the video actually used, into the skill (generic) or
  the studio (app) library;
- validates first: required `block.json` fields, a syntax check, no imports from video code, and
  no brand names in generic blocks (hardcoded colors produce a warning);
- bumps the version and appends a changelog line for updated blocks;
- records `blocks_used`, `blocks_added`, and `blocks_updated` in `meta.json`;
- with `--format`, saves this video's `src/` and `soundtrack.mjs` as the reusable skeleton for its
  format.

Blocks that are changed but unused are skipped: only parts exercised by a rendered video enter the
library. When the engine or several blocks change, run `studio selftest --blocks`: it scaffolds the
template in a temporary studio and renders every block's demo, failing on page errors.

## Formats

Save a format when a video introduces a story shape worth repeating, especially a series. Start a
later video from it with `studio new --slug <slug> --format <format>`: the scenes, cue structure,
and music bed come across, and you replace every string, the world treatment, and the signature
move. The variation rules still apply, so a saved format usually cannot follow itself directly
unless both videos belong to the same series.

## Signature blocks

`"signature": true` marks a move viewers remember (the logo landing on the floor, the dot-field
scan, the split-flap scoreboard). `studio check` warns when the previous video used the same
signature block, based on `blocks_used` (after harvest) or `blocks_planned` (list them in
`meta.json` while scripting). Reuse signature blocks, just not back to back.

## Learnings

`studio learn "<lesson>" --video <id>` appends to the studio's `LEARNINGS.md` (app specifics:
brand quirks, asset sizes, repository gates). `--scope engine` appends to the skill's
`LEARNINGS.md` (engine and block behavior). Read both at the start of every run. When a file passes
about 60 entries, consolidate it: merge duplicates, move durable engine rules into
`references/motion-craft.md`, and delete what is no longer true.

## Engine fixes versus blocks

Bugs in `lib/` get fixed in `$SKILL/engine/lib` (new videos pick up the fix when scaffolded; the
current video's `lib/` can be patched too), recorded with `studio learn --scope engine`, and
verified with `studio selftest --blocks`. New capabilities belong in blocks, not in the engine,
unless every video needs them.
