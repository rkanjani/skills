# Learnings (engine)

Engine and block lessons from previous runs, newest last. Read before building; add with
`studio.mjs learn --scope engine "<lesson>"`. Consolidate into references/motion-craft.md when this
passes about 60 entries.

- 2026-09-26: Fonts loaded through an injected stylesheet must finish loading before `document.fonts.load()` can see their @font-face rules; otherwise the first capture per render worker uses a fallback font and text is measured at the wrong size. boot.mjs waits for the stylesheet now; do not add fonts any other way.
- 2026-09-26: Opacity below 1 or any filter on an element whose children use preserve-3d flattens it, so flip cards show mirrored or wrong faces. Put opacity and blur on the faces.
- 2026-09-26: A component class declared after `.abs` silently overrode `position: absolute` and stacked tiles in normal flow. Give components an explicit position.
- 2026-09-26: Wide display fonts (for example Archivo 800) overflow at sizes that fit condensed fonts. Always fit display text with fitText; scoreboard-flip and feature-beats do.
- 2026-09-26: A block's `color` rule overrode `.display.outline`, turning outlined echo text solid. Scope block color rules (`.b-id .word.outline { color: transparent; }`).
- 2026-09-26: Hiding a scene while its exit is still visible causes a one-frame pop at the cut. Finish exits before the window ends, or cut hard on the beat on purpose.
- 2026-09-26: When a studio lives inside a repo with React Doctor, it scans every video and block: no innerHTML with dynamic values, no chained `.filter().forEach()`, batch style writes with `css()`, no `await` inside loops (use a reduce-based sequence), run independent awaits with `Promise.all`, use a Set instead of `array.includes()` inside loops, and split `map().sort()` or `map().filter()` chains into separate steps.
- 2026-09-26: After touching boot.mjs or render.mjs, confirm determinism: the first capture on a fresh page must match a later capture of the same time (ffmpeg psnr reports inf).
- 2026-09-26: 808 fundamentals under 60 Hz disappear on phone speakers and eat loudness headroom. Keep roots around MIDI 37 to 43 with drive above 2, and a presence shelf on the master. Verify octave balance with analyze-audio.mjs.
- 2026-09-26: Viewers could not follow the first 15 s DraftKit cut: eight acts at one bar each, 0.15 to 0.25 s transitions, and something new on almost every beat. Pace is not a style choice. Plan scenes before music (1.5 s plus 0.3 s per word, checked from meta.json scenes), keep transitions at 0.4 to 0.8 s through PACE, save snaps and whips for one or two accents, and stay under 45 s.
