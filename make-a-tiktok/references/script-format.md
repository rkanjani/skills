# Script, metadata, and post package

Each video folder carries three documents. `script.md` is the creative script a person (or the
next run) reads. `meta.json` is the machine-readable ledger entry the variation checker uses.
`post.md` is the posting package. Keep all three consistent with what was actually rendered.

## Contents

- meta.json fields
- script.md structure
- post.md
- Worked example: DraftKit #001

## meta.json fields

| Field | Meaning |
| --- | --- |
| `id`, `slug`, `title`, `app`, `created` | Set by `studio.mjs new`. |
| `status` | `scripting`, `building`, `rendered`, `posted`, `failed`, `archived`. Failed and archived videos do not count toward novelty. |
| `series` | Series id from `studio.json.series`, or null. |
| `length`, `bpm`, `bars` | Must satisfy `bars * 240 / bpm = length`, and length stays under 45 s (checked). |
| `axes` | One value per axis: `hook format feature world music persona camera cta length ending palette`. `feature` and `persona` come from the brand profile; the rest from `assets/axes.json`. `length` is the bucket the duration falls in (`0-15`, `16-25`, `26-35`, `36-44`). |
| `hook_line` | The exact line on screen at frame 0. |
| `scenes` | The pace plan, one entry per scene in order: `{ "id", "at", "out", "copy": [...] }` with times in seconds and the strings the viewer must read in that scene (the headline, key numbers, the line that carries the idea; not every UI label). The checker requires each scene to last at least 1.5 s plus 0.3 s per word (2 s minimum; symbols like "+" are free), flags gaps and overlaps, and expects the last scene to end at `length`. Be honest: if a label competes for attention, it counts. |
| `copy` | Optional. Every on-screen string in order, UI labels included; derived from `scenes` when omitted. The checker compares it against all previous videos. |
| `features` | Every product feature shown, by id. |
| `claims` | Factual statements made on screen, for the honesty check. |
| `covers` | Seconds to export as `cover-N.png`. Pick the hook frame, the peak, the end card. |
| `crop45` | Top offset of the 4:5 crop (default 185). |
| `outputs` | Filled by `studio.mjs log <id> --status rendered` from `out/manifest.json`. |
| `post` | `caption`, `hashtags`, `sound` (`original` or `trending`). |
| `performance` | Filled later with `studio.mjs log <id> --views ... --completion ...`. |
| `blocks_planned` | Blocks you intend to use, listed while scripting (drives the signature-rotation warning before build). |
| `blocks_used`, `blocks_added`, `blocks_updated` | Filled by `studio harvest <id>`. |
| `started_from` | Set by `studio new --format`: the saved format and the video it came from. |
| `notes` | Dated notes; failures and their causes go here. |

## script.md structure

The template (`template/script.md`) has these sections; fill every one:

1. Concept: one sentence (who, what moment, what proof).
2. Why this one is different: cite previous video ids and the axes that changed, plus the new
   signature move.
3. Audience and persona.
4. Hook: the frame-0 line and why it stops the scroll.
5. Scenes and pace: a table with one row per scene: time window, bars, the one idea, on-screen
   copy, picture, sound. Plan it before choosing BPM and bars: give each scene the time its copy
   needs, then fit the music around the total. This is what gets built; keep it in sync with
   `src/cues.mjs` and `meta.json` `scenes`.
6. Camera and world: the motif, the camera language, and the signature move.
7. Sound: genre, tempo, drop, sync points.
8. Ending and CTA.
9. Claims check: each claim and why it is true or clearly illustrative.
10. Decisions: choices made without the user, one line each (essential for unattended loops).

## post.md

Write it after the build:

```markdown
# Post: #NNN <title>

Upload: out/NNN-slug-9x16.mp4 (TikTok, Reels, Shorts), out/NNN-slug-4x5.mp4 (feeds)
Cover: out/cover-1.png (hook frame)
Sound: original mix, or out/NNN-slug-9x16-sfx-only.mp4 with a trending sound added in-app

Caption:
<hook restated as a line, then one line of value, then the CTA; under 150 characters>

Hashtags: #broad #niche #niche #brand   (3 to 5, no spam)

Disclaimer (when data is illustrative): <brand.disclaimers line>
```

Posting is always done by the user. Never upload, schedule, or publish on their behalf.

## Worked example: DraftKit #001

The first DraftKit video, built before the skill existed, lives at `examples/draftkit-001/`
(script and source). Summary of its choices, so later videos can vary from it:

- Hook `stakes-stat`: "DOWN 4-5." over a 9-category scoreboard with the swing categories glowing.
- Format `problem-ask-answer-payoff`, feature `waiver-streams` (plus a montage of start/sit and
  trade), persona `grinder`.
- World `domain-world` (a full NBA court in gold line art), camera `one-take` with whip orbits.
- Music `trap` at 128 BPM, 21 bars (39.4 s), drop at 20.6 s when the matchup flips to 6-3.
- Pace: first cut at 15 s (one bar per act) read as a blur; the re-cut gives each act 2 to 4 bars
  and passes the scene budget. Its `meta.json` `scenes` list is the reference for honest scene copy.
- Signature moves: record flies into a HUD chip, a waiver dot opens into the pick card with a
  circular reveal, split-flap tile flips, the logo drops onto center court with a shockwave.
- Ending `endcard` with CTA `url-endcard`.
