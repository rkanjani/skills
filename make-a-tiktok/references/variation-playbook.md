# Variation playbook

A page grows when every video is recognizably the same brand and never the same video. Identity
comes from the brand profile (colors, type, real screens, the sonic logo, voice) and from series.
Novelty has to come from the idea: a new moment, a new proof, a new shape of story, a new look, a
new sound. Re-skinning last week's video with new words is the failure this playbook exists to
prevent.

Variation never comes from pace. Every video, whatever its format, holds each scene long enough to
be understood on the first watch (see motion-craft.md, "Pace and comprehension"). Vary the idea,
the structure, the look, and the sound; do not vary how readable it is.

## Contents

- Why videos come out the same
- The selection loop
- What the checker enforces
- Reading history like an editor
- Start from the app
- From axes to a logline
- Name the look
- Formats are state lists
- The variation ladder
- Signature moves to rotate
- Series
- Using performance data
- Angle generators
- Honesty rules

## Why videos come out the same

The same request, made twice, produces videos that rhyme. Hundreds of identical one-line prompts
produce hundreds of near-identical reels: centered type on a gradient, everything fading in, a
logo at the end. The cause is not a lack of skill. It is that nothing in the request was specific,
so every open choice fell to the same default.

In this engine the defaults are known, because they are what the first videos on three different
apps all did:

- First frame: a line of display type over the world.
- Middle: a walk through product UI, one feature per scene, each scene the same length.
- Late: a payoff line, one word per beat.
- End: the logo, a tagline, and a URL button, with a boom and a crash.
- Sound: a pad that opens through a build, a riser, a gap, a drop, the same kick and whoosh.

None of these is wrong once. Each is wrong as the thing that happens when nobody decided. The cure
is to make every open choice specific before building: specific to this app (what only it can
show), to this video (axes that differ from the ledger and the portfolio), to a reference (a look
with a name), and to a designed sound.

## The selection loop

1. `studio status`: resume anything `scripting` or `building` before starting new work, and do
   everything on its DO NOW list yourself (the brand profile's gaps).
2. `studio history --last 12`: hooks, axes, structure, look, new moves, sound kit, and performance
   of recent videos, followed by what was made for other apps on this machine and the defaults
   they share.
3. Read the last three `script.md` files in full. Note each one's signature move and its
   emotional beat.
4. `studio gallery`: look at the image. One row of twelve frames per recent video, this app first,
   then other apps.
5. `studio axes`: what has been overused and what has never been tried (`--how <axis>` explains
   each value; `(app)` marks this app's own).
6. `studio suggest --n 6`: full combinations that already satisfy the rules, each with a scene
   skeleton, a tempo, and a sound kit. Open backlog ideas are listed after them.
7. Pick one and turn it into a logline, a named look, and a new move (below). You may change any
   axis as long as `check` still passes.
8. `studio new --slug <slug> --pick <n> --seed <seed>`, fill `meta.json` and `script.md`, run
   `studio sound <id>` and `studio check <id>`. A FAIL lists exactly what repeats; change the
   idea, not just the words, until it passes.

## What the checker enforces

Defaults are in `assets/axes.json` `rules`, overridable per studio in `studio.json` `rules`.

Against this studio's ledger:

- At least 5 of the 13 axes differ from each of the last 5 videos.
- A different hook type, opening, format, register, and ending than the previous video (format
  may repeat inside a series).
- No repeated hook + format + feature combination, ever.
- No identical, near-identical, or paraphrased hook line; on-screen copy under 25 percent trigram
  overlap with any previous video.
- A different scene rhythm than the previous video (scene count and how long each runs), and not
  the scaffold's scene list.
- Visual blocks at most 70 percent shared with the previous video, and never the scaffold's four
  together.
- A look with a name, different from the previous video's.
- At least one new move, not a repeat of a recent one.
- A sound kit from a different family and in a different shape than the previous video, at least 6
  of 15 choices away from each of the last five, and a rendered soundtrack that measures under 78
  percent like any earlier one.

Against the portfolio (videos made on this machine for other apps):

- At least 6 of the 9 shared axes (hook, opening, format, register, world, music, camera, cta,
  ending) differ from each of the last 4.
- Any value that 3 of the last 4 videos made here used, on those axes, is ruled out for this one.
  This is what stops every app's first video from ending on the same end card.
- The sound kit is at least 5 choices away from each of their kits.

The portfolio lives at `~/.make-a-tiktok/` (set `TIKTOK_PORTFOLIO` to move it or to `off`) and
keeps itself up to date: `studio status` records this studio and finds the others on the machine
by looking at the repositories next to this one and their worktrees. It reads those studios
without changing them, and keeps its own copy of each video's strip and soundtrack fingerprint,
so the comparison survives a deleted worktree. For a video made before sound kits existed, the
instrument family is read off its `music` value and its arc is taken to be a build and a drop,
which is what every bed was then. `studio portfolio` lists what is recorded. A viewer of one page
never sees another, so this rule is for the person who commissions all of them: it keeps the
engine from having a house style it did not choose.

## Reading history like an editor

For each of the last few videos, write down in one line each: the moment it dramatized, the
proof it showed, the signature move, how it ended. Then look at the gallery and ask what a regular
viewer has now seen too often. Typical traps:

- The same story arc every time (problem, product, win) with different nouns.
- The same end card choreography.
- The same product surface (always the chat, always the scoreboard).
- The same emotional register (always triumphant; never funny, never calm, never nerdy).
- The same first frame composition (always a giant line top-left).
- The same layout (always a phone in the middle, always cards stacked from the top).
- The same use of the palette (always the cream ground with the accent on buttons).

The checker catches repeated axes, text, structure, and sound. It cannot see a repeated layout;
the gallery is how you do.

## Start from the app

The strongest source of difference is the thing no other app has. Before choosing axes, answer
from the brand profile:

- What can only this app show? (`identity.only_here`: a painting made from three answers, every
  photo a guest is in, a matchup flipping on one stream.)
- When does a real person reach for it? (`identity.moments`: the night the photos come back,
  Sunday before lineups lock.)
- What does its world look like? (`identity.motifs`, the app's own values on the `world` axis.)
- What does it sound like? (`sound`: the families that suit it, the ones it avoids, its motif, a
  domain sound.)

A concept that would still work with another app's logo on it is not a concept for this app. When
a studio has no app-specific values (`studio status` says so), add them before making the next
video: three to six looks and two to four formats of its own.

## From axes to a logline

A logline is one sentence that names a specific person, a specific moment, and a specific proof:

> A busy manager at lineup lock (persona + moment) watches the lineup sort itself with START and
> SIT pills as a countdown hits zero (proof + format).

Then the rest of the recipe: opening + world + camera + register + sound + ending. Then the hook
line for the first frame. Good hook lines are concrete, short (under 7 words on screen), and
would make the persona stop scrolling. Test: could this line appear in any other app's video? If
yes, make it more specific.

The `opening` axis is the first frame's device, separate from the hook's rhetoric: the same
question can open as huge type, as a small card in a lot of space, or as a comment bubble. The
`register` axis is the feeling: a countdown can be tense or deadpan, and those are different
videos. Sound follows the register (`register` lists the instrument families that suit it).

How each hook type sounds (fantasy sports examples; translate to the app):

- stakes-stat: "DOWN 4-5." / "0.3 steals from a win."
- pov: "POV: lineups lock in 90 seconds."
- question: "Would you drop him for a 4-game guy?"
- bold-claim: "Your rankings are losing you steals."
- myth-bust: "Stop streaming by projected points."
- before-after: "Tuesday: 9th. Sunday: 4th."
- countdown: "Lock in 10. 9. 8."
- list-promise: "3 streams for a 4-game week."
- challenge: "I let the AI run my team for a week."
- confession: "I lost a final by one assist."
- versus: "Spreadsheet vs 12 seconds."
- secret: "The waiver trick nobody in your league uses."
- reaction: "League chat after my trade:"
- quiz: "Pick one. The AI already did."

## Name the look

Without a reference, the look falls back to the default. Naming a style beats describing one, and
something to point at beats both. Each video records its look in `meta.json`:

```json
"look": {
  "name": "museum wall label",
  "reference": "brand/refs/wall-label.jpg",
  "take": ["small serif caption under a large image", "thin rule", "a lot of plaster"],
  "leave": ["the artwork itself", "the museum's logo"]
}
```

Where a look comes from, strongest first:

- A frame: one frame of a video you admire, saved with `studio refs <image>`. Say what to take
  (palette, type, grain, layout) and what to leave (its subject).
- A video: `studio refs <video>` writes a contact sheet and measures the shot lengths. Describe
  the pacing shot by shot before writing any code.
- The brand's own library: its real screens, marketing pages, photography, packaging.
  `brand/style_guide.md` distills it once per app.
- A named style from the world: a departure board, a receipt, a field guide plate, a contact
  sheet, a transit map, a trading card, a lab notebook.

Take the grammar of a reference (palette, type, spacing, pacing, how things enter and leave),
never its content, logos, or characters. Then let the look decide the technique: a paper look may
want a hand-built paper renderer rather than the line-art world. Specify the look and the
constraints, not the library.

Two looks in a row may not share a name, and the name should be one a stranger could picture.
"Clean and modern" is not a look.

## Formats are state lists

A format in `assets/axes.json` carries `beats`: the story's steps and each one's share of the
time. `studio suggest` and `studio new` turn them into a scene skeleton in whole bars. Write the
script from that skeleton as a state list: for each state, what is on screen, the real data it
shows, and what causes the change to the next state (a tap, a typed word, a tick of the clock, a
cut on the downbeat). A vibe cannot be built or checked; a state list can.

Formats worth knowing beyond the usual problem-and-payoff:

- `one-shape-morph`: one container never cuts. The same element changes size, radius, and fill
  through six to ten product states (button, field, loader, card, chart, toast), its content swaps
  behind a short blur, a cursor drives every change, and the last frame equals the first.
- `ui-film-set`: the product screen is the set, and the story is acted inside it.
- `cold-open-result`: open on the finished result, rewind, return.
- `single-take-zoom`: one detail, and a continuous pull-out to what it belongs to.
- `showreel`: every shot a different technique on a different surface.
- `asmr-loop`: no words, product interactions in rhythm, a seamless loop.
- `comment-reply`: a real question is the first card.

A brand adds its own under `axes.add.format`, each with `beats`.

## The variation ladder

Each rung changes more than the one below it. Aim for at least rung 4 every time.

1. New copy on the same structure (never enough on its own).
2. New feature or new data in the same format.
3. New format, opening, or hook type.
4. New look and new sound, so it looks and sounds different in the first second.
5. New emotional register: funny, tense, calm-expert, nostalgic, deadpan, nerdy, wholesome.
6. A new idea of what a video for this app can be: no words at all, one object for thirty
   seconds, a loop, a reply to a comment.

## Signature moves to rotate

The move people remember should not repeat on consecutive videos. Each video names at least one
new one in `new_moves`. Rotate through, and invent:

- Logo drops onto the world floor with a shockwave (used by the DraftKit showreel).
- Seamless loop: the last frame becomes the first.
- Shared-element flight: a number or card flies into a HUD or into the next scene.
- One container morphing through every state, driven by a cursor.
- Circular reveal from a point in the world.
- Split-flap or 3D flip of tiles to change a state.
- Slot-counter countdown or count-up.
- A tab indicator that stretches as it travels (`stretch` in `lib/core.mjs`).
- Typewriter URL with a caret instead of a logo end card.
- Notification stack that resolves into the product.
- Data viz that morphs into the product UI.
- A real screenshot that the camera pushes into until one number fills the frame.
- Dolly zoom into the drop.
- Hard cut to black on the beat before the payoff.

Record the signature move in `script.md` so the next run can see it.

## Series

A series is a named recurring format ("Waiver Wednesday", "Trade Check", "One Stat"). It builds
habit and makes the page scannable. Declare series in `studio.json.series` with the format and
ending they keep. Inside a series, the format may repeat; hook, opening, register, feature, copy,
look, and sound still have to change. Pass `--series <id>` to `suggest`, and set `series` in
meta.json.

## Using performance data

After posting, log numbers: `studio log 007 --status posted --views 18400 --likes 1320
--shares 88 --saves 140 --completion 0.41 --watch 6.2`. Once five videos have views, `suggest`
spends about 70 percent of its slots exploiting axis values that beat the page average and 30
percent exploring new ones. Read signals by axis:

- Completion rate and average watch time: the hook and the first two seconds, then pacing.
- Shares: relatability and humor (reaction, confession, pov).
- Saves: utility (listicle, tutorial, secret).
- Comments: questions, quizzes, and hot takes.

Never treat a model score or a hunch as measured performance.

## Angle generators

When suggestions feel stale, generate fresh angles from:

- The calendar: season start, draft day, trade deadline, playoffs, off-season, holidays.
- A single number from the product (a margin, a rank, a streak) and the story behind it.
- A mistake the audience makes and the one-tap fix.
- The product thinking, made visible: what the AI checks, in order.
- A rivalry or a group chat moment.
- A speedrun: do the job start to finish against a visible clock (the clock reads fast; the
  steps still hold long enough to follow).
- UI ASMR: no words, just satisfying product interactions in rhythm.
- A myth the category repeats and the evidence against it.
- A feature most users never find.
- A before/after week, told in two frames.
- The history of the problem, from how people did it before to now.
- A real question from the comments.

Add good leftovers to the backlog: `studio backlog add "Trade deadline panic, 3 checks" --fix feature=trade-analyzer`.

## Honesty rules

- Example data (names, stats, results) must be illustrative and consistent with how the product
  really works. Keep the brand's disclaimer in the post caption when the data is fictional.
- No fake testimonials presented as real users, no invented metrics about the product, no
  guaranteed outcomes. A `comment-reply` uses a real comment or says the example is illustrative.
- Show the real product surfaces faithfully; mock what the UI actually does, not what it might.
- No competitor logos, no real people's likenesses, no trademarked audio, no track the user did
  not supply.
