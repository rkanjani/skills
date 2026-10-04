# Variation playbook

A page grows when every video is recognizably the same brand and never the same video. Identity
comes from the brand profile (colors, type, world motif, voice) and from series. Novelty has to
come from the idea: a new moment, a new proof, a new shape of story. Re-skinning last week's
video with new words is the failure this playbook exists to prevent.

Variation never comes from pace. Every video, whatever its format, holds each scene long enough to
be understood on the first watch (see motion-craft.md, "Pace and comprehension"). Vary the idea,
the structure, and the look; do not vary how readable it is. When a concept has more ideas than
fit under 45 s at a readable pace, cut ideas or split it into a series.

## Contents

- The selection loop
- Reading history like an editor
- From axes to a concept
- The variation ladder
- Signature moves to rotate
- Series
- Using performance data
- Angle generators
- Honesty rules

## The selection loop

1. `studio.mjs status`: resume anything `scripting` or `building` before starting new work.
2. `studio.mjs history --last 12`: hooks, axes, copy, and performance of recent videos.
3. Read the last three `script.md` files in full. Note each one's signature move (the transition
   or visual people would remember) and its emotional beat.
4. `studio.mjs axes`: what has been overused and what has never been tried.
5. `studio.mjs suggest --n 6`: axis combinations that already satisfy the hard rules, ranked by
   novelty (and by performance once there is data). Open backlog ideas are listed after them.
6. Pick one suggestion or backlog idea and turn it into a concept (below). You may change any axis
   as long as `check` still passes; the suggestions are a starting point, not a script.
7. Fill `meta.json` (axes, hook_line, copy, features, claims) and run `studio.mjs check <id>`.
   A FAIL lists exactly what repeats; change the idea, not just the words, until it passes.

The hard rules (defaults in `assets/axes.json`, overridable per studio in `studio.json.rules`):
at least 3 differing axes against each of the last 5 videos; no repeated hook + format + feature
combination; a different hook type and format than the previous video (format may repeat inside a
series); no identical or near-identical hook line; on-screen copy under 25 percent trigram overlap
with any previous video.

## Reading history like an editor

For each of the last few videos, write down in one line each: the moment it dramatized, the
proof it showed, the signature move, how it ended. Then ask what a regular viewer of the page has
now seen too often. Typical traps:

- The same story arc every time (problem, product, win) with different nouns.
- The same end card choreography.
- The same product surface (always the chat, always the scoreboard).
- The same emotional register (always triumphant; never funny, never calm, never nerdy).
- The same first frame composition (always a giant word top-left).

The checker catches repeated axes and text. It cannot catch a repeated feeling; that is your job.

## From axes to a concept

A concept is one sentence that names a specific person, a specific moment, and a specific proof:

> For a freelancer on invoice day (persona + moment), show the open invoices sorting themselves
> with PAID and LATE pills as a countdown hits zero (feature proof + format), in the grid world with
> hard cuts on every tick (world + camera), ending on a seamless loop back to the clock (ending).

Recipe: persona + moment + feature proof + format shape + world + camera + sound + ending. Then
write the hook line for the first frame. Good hook lines are concrete, short (under 7 words on
screen), and would make the persona stop scrolling. Test: could this line appear in any other
app's video? If yes, make it more specific.

How each hook type sounds (examples from unrelated apps; write yours in the app's own language):

- stakes-stat: "$412 over budget." / "2 days from the deadline."
- pov: "POV: the invite goes out in 90 seconds."
- question: "Would you book the 6 a.m. flight?"
- bold-claim: "Your to-do list is lying to you."
- myth-bust: "Stop tracking every calorie."
- before-after: "Monday: 47 tabs. Friday: 3."
- countdown: "Doors in 10. 9. 8."
- list-promise: "3 fixes for a slow morning."
- challenge: "I let the AI plan my week."
- confession: "I missed rent by one invoice."
- versus: "Spreadsheet vs 12 seconds."
- secret: "The shortcut nobody on your team uses."
- reaction: "Group chat after I shared this:"
- quiz: "Pick one. The AI already did."

## The variation ladder

Each rung changes more than the one below it. Aim for at least rung 3 every time and reach
rung 5 regularly.

1. New copy on the same structure (never enough on its own).
2. New feature or new data in the same format.
3. New format or new hook type.
4. New world, camera language, or sound, so it looks and feels different in the first second.
5. New emotional register: funny, tense, calm-expert, nostalgic, rivalrous, nerdy.

## Signature moves to rotate

The move people remember should not repeat on consecutive videos. Rotate through, and invent:

- Logo drops onto the world floor with a shockwave.
- Seamless loop: the last frame becomes the first.
- Shared-element flight: a number or card flies into a HUD or into the next scene.
- Circular reveal from a point in the world.
- Split-flap or 3D flip of tiles to change a state.
- Slot-counter countdown or count-up.
- Whip orbit around the world on every beat.
- Typewriter URL with a caret instead of a logo end card.
- Notification stack that resolves into the product.
- Data viz that morphs into the product UI.
- Dolly zoom into the drop.
- Hard cut to black on the beat before the payoff.

Record the signature move in `script.md` so the next run can see it.

## Series

A series is a named recurring format ("Monday Reset", "60-Second Fix", "One Stat"). It builds
habit and makes the page scannable. Declare series in `studio.json.series` with the format and
ending they keep. Inside a series, the format may repeat; hook, feature, copy, and at least two
other axes still have to change. Pass `--series <id>` to `suggest`, and set `series` in meta.json.

## Using performance data

After posting, log numbers: `studio.mjs log 007 --status posted --views 18400 --likes 1320
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

- The calendar: launches, seasonal peaks, deadlines, holidays, the start of a week or a year.
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

Add good leftovers to the backlog: `studio.mjs backlog add "Deadline panic, 3 checks" --fix feature=<feature-id>`.

## Honesty rules

- Example data (names, stats, results) must be illustrative and consistent with how the product
  really works. Keep the brand's disclaimer in the post caption when the data is fictional.
- No fake testimonials presented as real users, no invented metrics about the product, no
  guaranteed outcomes.
- Show the real product surfaces faithfully; mock what the UI actually does, not what it might.
- No competitor logos, no real people's likenesses, no trademarked audio.
