# Motion craft

The bar is a motion designer's showreel that a stranger understands on the first watch: every
scene carries one idea, every element enters and leaves with intent, and the whole piece moves
like one designed film. This file covers pace, layout, type, rhythm, camera, transitions, the
pitfalls that cost the most time, and the review loop.

## Contents

- Pace and comprehension (read first)
- Frame and safe zones
- Type and reading time
- The first frame
- Rhythm
- Camera and depth
- Transitions
- Brand fidelity
- Pitfalls (hard-won)
- Review loop and QA checklist

## Pace and comprehension

A beautiful video nobody can follow gets scrolled past. The order of priorities is: every scene
understood on the first watch, then craft, then brevity. "Short and punchy" that nobody can read
is a failure, not a style.

- **Length follows content, always under 45 s.** Budget the hook 3 to 4 s, each idea 3.5 to 5 s,
  and the end card 3 to 4 s. One idea makes a 10 to 15 s video; three ideas make 20 to 30 s; a
  walkthrough runs 30 to 44 s. Never cut holds or speed up motion to hit a length; cut an idea.
- **One idea per scene.** If you cannot say what a scene says in one short sentence, split it or
  cut it. Change scenes on bar lines, usually every 2 bars at 120 to 128 BPM (about 4 s).
- **Reading time.** A scene needs 1.5 s plus 0.3 s per word the viewer must read; the checker
  enforces this from `meta.json` `scenes`. Viewers read about three words per second while
  watching motion, and less when the text itself moves. A key line holds completely still and
  legible for at least 1.2 s after it lands.
- **One focal point at a time.** Only one thing makes a big move at once; everything else holds or
  drifts. Stagger related elements by 0.12 to 0.25 s so the eye follows the order, and land at
  most one new element per beat inside a scene.
- **Transition speed.** Scene transitions take 0.4 to 0.8 s: exits 0.3 to 0.5 s (ease-in), entrances
  0.4 to 0.7 s (ease-out with a gentle settle). Element entrances inside a scene take 0.35 to
  0.6 s. `PACE` in `lib/core.mjs` holds the house defaults every block uses.
- **Accents are rare.** Snaps under 0.25 s, whips, flashes, and shakes are for one or two moments
  per video (the drop, the reveal, the logo landing). When everything snaps, nothing does.
- **Breathing room.** After each big moment, give 0.5 to 1 s of low motion before the next change.
  The camera travels during transitions (about 1 s) and nearly holds while copy is on screen.
- **Typing and counting.** Type at no more than 18 characters per second and let the finished line
  sit for 0.4 s before it is sent. Counters and rolls take 0.4 to 0.6 s per step, and each value
  stays readable for at least 0.8 s.
- **The hook still lands fast.** Frame 0 shows the hook line mid-motion, and the line is fully
  readable by 0.6 s. Then it holds long enough to read, like every other line.
- **Test it.** Watch the preview once at full speed with sound off and no pausing. Say out loud
  what each scene told you. Any scene you could not say needs more time or less copy.

## Frame and safe zones

The canvas is 1080 x 1920 at 60 fps. TikTok, Reels, and Shorts cover parts of it:

- Top 0 to 220: status bar and feed tabs.
- Bottom 1500 to 1920: caption, username, sound ticker.
- Right rail x 940 to 1080, y 700 to 1600: like, comment, share, profile.

Keep critical copy inside x 60 to 960 and y 220 to 1480. Decorative world and effects can bleed
everywhere. The 4:5 export crops y 185 to 1535 (`meta.crop45`), so anything essential for feeds
must also fit there.

## Type and reading time

- Hook and payoff words: 250 to 360 px display type, fitted with `fitText` to about 940 px wide.
- Section titles: 150 to 220 px. Product UI primary text: 44 to 66 px. Secondary: 30 to 36 px.
  Nothing below 26 px. Phone screens show the video at about a third of its size.
- Keep lines short: a hook of 2 to 6 words, titles of 1 to 4 words, proof lines under 8 words.
  Two short lines read faster than one long one. See "Pace and comprehension" for hold times.
- Numbers are the fastest thing to read. Prefer "+9%" to "it went up by nine percent".
- Use tabular numerals for anything that changes (`.num`).

## The first frame

Frame 0 is the thumbnail and the scroll-stopper. Start animations slightly before zero (negative
start times) so frame 0 already shows the hook line mid-motion but readable, over a world that is
already drawing on. A blank or half-built first frame loses the viewer.

## Rhythm

- Everything lands on the beat grid from `src/cues.mjs`: arrivals on beats, scene changes on bar
  downbeats, the drop at the midpoint or the two-thirds point. On the beat does not mean
  something new on every beat; most beats inside a scene are holds.
- Start motion a little before the beat (anticipation) and let it settle after (a gentle
  overshoot with `spring` or `E.outBack`).
- Alternate density: a dense UI scene, then a big simple word. Constant density is exhausting.
- Leave the end card on screen for at least 2 s after the last element lands.
- A beat of near-silence and stillness before the drop makes the drop hit twice as hard.

## Camera and depth

- The world camera gives static UI depth. Plan one camera move per scene change in
  `src/world.mjs`, about 1 s long around the cut, and let the camera nearly hold while copy is on
  screen. Ease with the house curves: `glide` for travel, `snap` for landings, `whip` only for an
  accent moment.
- Add deterministic shake only on impacts (`cameraTrack(..., { shake })`), never continuously.
- Layers from back to front: world canvas, floor decals, UI (CSS perspective 2600 px), effects,
  vignette. Blur or dim the layer that is not the subject during transitions.
- Motion blur is automatic in the final build (4x temporal supersampling), so fast moves look
  cinematic. Preview renders do not include it; judge speed in the final.

## Transitions

- Exit before you enter. Two dense UIs cross-fading reads as mud. Clear the old scene over the
  0.3 to 0.5 s before the downbeat, then land the new one on it. Every block's `cues.out` is the
  moment it is fully gone, so set it to the next scene's start.
- Or cut hard on the bar line on purpose. Cuts on the beat feel intentional; cuts off the beat feel
  like errors. A hard cut still needs the new frame to hold long enough to read.
- Shared elements make the smartest transitions: a number that flies into a HUD, a dot on the
  floor that opens into a card (`circularReveal`), a word that becomes a button.
- Whips need motion in both layers: the world yaws and the UI slides with skew and blur. Keep
  them to 0.4 to 0.6 s and to the biggest transitions.
- Rotate the signature move between videos (see the variation playbook).

## Brand fidelity

- Colors come from brand CSS variables only. Reserve positive, negative, and warning colors for
  real states (wins, losses, alerts). Do not assign decorative colors per element.
- Use the brand's display and body fonts, its icon set, and its real logo file.
- Mock product UI faithfully: read the app's components and copy their structure and wording.
  If the app does not do something, the video must not show it.
- Follow `brand.voice`: tone, the do and don't lists, and banned characters or words. The checker
  fails on banned text.

## Pitfalls (hard-won)

- Opacity below 1 or any `filter` on an element whose children use `transform-style: preserve-3d`
  flattens it. Flipped cards then show mirrored or wrong faces. Put opacity and blur on the faces.
- A component class declared after `.abs` can silently override `position: absolute` and stack
  elements in normal flow. Give components an explicit position.
- Measure text only after fonts load, and measure the text itself: block elements report their
  container width. `fitText` handles this.
- Hiding a scene with `vis(false)` while its exit is still visible causes a pop. Finish exits
  before the scene's window ends.
- Floor decals (`placeOnFloor`) must live in the `floor` layer, outside any CSS perspective.
- Determinism: no CSS transitions or animations (they run on the wall clock), no `Date.now`, no
  `Math.random`. Use `rng(seed)` and drive everything from `update(t)`.
- Keep per-frame work light: large blurs on big elements for many frames slow capture a lot.
- Wide display fonts overflow at sizes that fit condensed ones. Fit every display line with
  `fitText` instead of trusting a fixed font size.
- Block stylesheets load after `kit.css`, so a block's color rule can override utility classes
  (it once turned `.display.outline` echo text solid). Scope color rules narrowly.
- Inside a repository with lint gates (React Doctor, ESLint), avoid `innerHTML` with dynamic
  values (use `icon()` and `textContent`), batch style writes with `css()`, and avoid chained
  `.filter().forEach()`. Run the repository's checks before finishing.

## Review loop and QA checklist

1. `node render.mjs sheet --step 0.5`: the whole piece at thumbnail scale (roughly what a phone
   shows). Look for empty beats, overlaps, unreadable text, and weak first frames. Every scene
   should show the same settled frame in at least two consecutive cells; if a scene never
   settles, it moves too much to read.
2. `node render.mjs stills --times ...`: full-resolution detail on every dense moment.
3. `node render.mjs sheet --from A --to B --step 0.033`: frame-by-frame through each transition.
4. `node render.mjs preview --fps 30 --audio out/soundtrack.wav`: pacing with sound. Watch it once
   at full speed with sound off and say what each scene told you.
5. `node build.mjs`, then view `out/cover-*.png` and a sheet of the final MP4.

Before calling it done:

- [ ] Frame 0 shows the hook line legibly.
- [ ] Every scene passes the first-watch test, and `studio check` passes the pace budget.
- [ ] Key lines hold still for at least 1.2 s; transitions take 0.4 s or more except the accents.
- [ ] Every line is inside the safe zone.
- [ ] No transition shows two dense layers at once; no pops when scenes hide.
- [ ] Brand colors, fonts, logo, and voice rules are respected; copy matches `meta.json` `scenes`.
- [ ] Every claim is true or clearly illustrative (see `script.md` claims check).
- [ ] Audio: -14 LUFS, true peak at or under -1 dBTP, balance checked (see sound-design.md).
- [ ] `manifest.json` shows 1080x1920 at 60 fps with the expected frame count.
