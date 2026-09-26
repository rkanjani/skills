# Sound design

Most viewers watch with sound on, and sound is what makes cuts feel intentional. The engine
synthesizes everything in code (`lib/synth.mjs`), so each video can have a different genre and
every visual hit can have a matching sound. You cannot listen to the result, so the verification
steps below are not optional.

## Contents

- Beat math
- Genre recipes
- The sync map
- Stems
- Mix targets and verification
- Being honest about audio

## Beat math

Plan the scenes first (each needs 1.5 s plus 0.3 s per word), then pick bars and BPM so the music
ends exactly on the last frame: `seconds = bars * 240 / bpm`. Stay under 45 s. At 120 to 128
BPM, 2 bars (3.75 to 4 s) per scene is the comfortable default; slower tempos (90 to 100) suit
explanations, and faster genres still change scenes only on bar lines.

| Length | Options (bars @ BPM) | Scenes at 2 bars each |
| --- | --- | --- |
| 10 s | 5 @ 120, 4 @ 96 | 2 or 3 |
| 15 s | 8 @ 128, 6 @ 96 | 4 |
| 20 s | 10 @ 120, 8 @ 96 | 5 |
| 24 s | 12 @ 120 (the template), 10 @ 100 | 6 |
| 30 s | 16 @ 128, 15 @ 120, 12 @ 96 | 8 |
| 36 s | 18 @ 120, 15 @ 100 | 9 |
| 40 s | 20 @ 120, 16 @ 96 | 10 |
| 43.1 s | 23 @ 128 | 11 or 12 |

Set the grid once in `src/cues.mjs` with `beatGrid(bpm, bars)` and derive every cue from `b(n)`
and `step(bar, sixteenth)`. Keep a `KICKS` list there so the world can pulse on the same hits.

## Genre recipes

Match the genre to the `music` axis and the emotional register of the concept.

- trap (126-145): `mix.drums(grid, bar, 'trap')`, sustained `sub808` on chord roots with glides,
  `supersaw` pads under a low-pass that opens into the drop, stabs on key words. Competitive, hype.
- phonk (120-140): `'phonk'` pattern (cowbell melody built in), `PROGRESSIONS.darkPhonk`, heavy
  808 with more drive. Swagger, rivalry, trash talk.
- house (120-128): `'house'`, `upliftMajor`, plucks on offbeats. Upbeat, product-tour energy.
- drill (138-145): `'drill'`, `tenseDrill`, sliding 808s (glideFrom). Tension, countdowns.
- lofi (78-96): `'lofi'`, `keys()` with `lofiSevenths`, `vinyl()` bed, fewer impacts. Calm expert,
  tutorials, "one smart trick".
- boombap (86-96): `'boombap'`, confident and conversational.
- dnb (168-176): `'dnb'`, fast information, speedruns.
- hyperpop (150-170): `'hyperpop'`, bright stabs, playful chaos, memes.
- four-on-floor (124-132): `'four'` for rapid-fire lists where every beat lands a word.
- ui-asmr: no drums or pads at all. Rhythm comes from `tick`, `whoosh`, `bell`, `blip`, and
  `swish` placed on the grid. Great for satisfying product moments.

Structure that works at 20 to 35 s: a filtered build under the setup scenes with a riser, a
short gap of near-silence right before the drop (the `suck`), the drop on the downbeat where the
story turns (often the payoff scene), then a final impact and a ringing chord under the end card
with a fade in the last 0.35 s. Transitions are slower now, so stretch whooshes across the whole
transition (0.5 to 0.9 s) instead of a 0.2 s zip, and keep the loudest hits for the accents.

## The sync map

Every visual event gets a sound, placed on the same cue:

| Visual | Sound |
| --- | --- |
| Word or number slams | `boom` (small), `snare` or `clap`, or a `stab` |
| Whip, swipe, camera move | `whoosh` starting about 0.2 s before the landing |
| UI tap, key, toggle | `tick` (vary f and gain so repeats do not sound robotic) |
| Confirmation, success | `bell` arpeggio (2 to 3 notes, 40 ms apart) |
| Counter rolls | a fast run of quiet `tick`s |
| Rank or level up | rising `blip` notes |
| Big reveal, logo | `boom` + `crash` + a held chord; `buzzer` for sports |
| Domain flavor | `bounce` and `swish` (basketball), `crowd` (arenas), `vinyl` (lo-fi) |

## Stems

`mix.render()` writes the full mix and a music-free SFX stem (`soundtrack-sfx.wav`). The build
turns the stem into `*-sfx-only.mp4` so the video can be posted with a trending sound added in
the app. Put impacts, whooshes, and UI sounds in the default `sfx` stem and anything musical
(drums, pads, bass, stabs) in `music`.

## Mix targets and verification

Targets for social platforms and phone speakers:

- Integrated loudness -14 LUFS and true peak at or under -1 dBTP. `build.mjs` normalizes with two
  pass loudnorm and records the measured values in `out/manifest.json`.
- Octave balance (`node analyze-audio.mjs out/soundtrack.wav "0-15"`): 60-120 Hz the loudest band,
  20-60 Hz 2 to 4 dB under it, 250-1000 Hz around -9 to -12 dB, 2-4 kHz around -16 to -20 dB,
  8-16 kHz around -20 to -24 dB. Phones reproduce almost nothing under 150 Hz, so the 808 must
  have harmonics (keep `drive` above 2) and fundamentals around MIDI 37 to 43.
- If the sub band dominates, raise the 808 an octave, shorten booms, or lower their gain. If the
  top is dull, raise hats and ticks or the master shelf (`mix.render(out, { shelfDb })`).
- Check timing with a spectrogram: `ffmpeg -i out/soundtrack.wav -lavfi
  showspectrumpic=s=1800x600:scale=log:fscale=log -y out/spec.png`, then view it and confirm
  transients line up with the cue times.

## Being honest about audio

You cannot hear the mix. Say so when reporting, name what you verified (loudness, balance, sync),
and point the user to the SFX-only version if they would rather use a licensed or trending
track. Never claim the music "sounds great".
