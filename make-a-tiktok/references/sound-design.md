# Sound design

Most viewers watch with sound on, and sound is what makes cuts feel intentional. It is also the
fastest way for a page to feel repetitive: the same kick, the same riser, the same boom under the
logo. So every video gets its own sound kit, designed in code, and the checker compares both the
design and the rendered audio with earlier videos. You cannot listen to the result, so the
verification steps below are not optional.

## Contents

- Sound kits
- Arrangement shapes
- Beat math
- Writing soundtrack.mjs
- The sync map
- The sonic logo
- A supplied track
- Voice
- Stems
- Mix targets and verification
- Being honest about audio

## Sound kits

A kit (`lib/soundkit.mjs`) is one video's sound identity: an instrument family, a key and mode, a
chord path, a groove, an arrangement shape, a bass, a chord instrument, a lead, a drum set, and a
matching set of sound-design voices (impact, move, tick, confirmation, riser). It is seeded, so a
spec always designs the same kit, and any field you set overrides the seeded choice.

`studio sound <id>` designs the kit for a video: the `music` axis picks the family and groove, the
seed picks everything else, and it keeps trying seeds until the kit differs enough from the last
five kits here and from other apps' recent kits. It stores the result in `meta.json` `sound`,
writes the groove and shape into `src/cues.mjs`, and prints beat math for the planned length.

```bash
studio sound 007                      # design, or re-validate the stored design
studio sound 007 --reroll             # another kit in the same family
studio sound 007 --set lead=whistle,shape=pulse,key=D,mode=dorian
```

| Family | What it is | Music axis values | Suits |
| --- | --- | --- | --- |
| `sub808` | tuned 808, dark pads, crisp kit | trap, phonk, drill | hype, tense, rivalrous |
| `club` | four on the floor, offbeat bass, stabs | house, four-on-floor, garage, disco | hype, funny |
| `breaks` | fast breakbeats, reese or FM bass | dnb, hyperpop, breakbeat | hype, tense |
| `retro` | bass eighths, gated snare, brassy pads | synthwave | nostalgic, nerdy |
| `dusty` | soft keys, round bass, swung drums, vinyl | lofi, boombap | calm-expert, nostalgic, cozy |
| `mallet` | marimba or kalimba, hand percussion | mallets | wholesome, funny, calm-expert |
| `piano` | solo piano, no drums | piano-score | calm-expert, deadpan, awe |
| `cinematic` | strings or brass, timpani | cinematic-swell | awe, tense |
| `glass` | glassy pads and bells, no drums | ambient-glass | awe, cozy, calm-expert |
| `chip` | square lead, triangle bass, noise drums | chiptune | funny, nerdy |
| `percussion` | stomps, claps, hand percussion, a bass note | stomp-clap | funny, deadpan, rivalrous |
| `asmr` | no music; product sounds carry the rhythm | ui-asmr | cozy, deadpan, nerdy |

Rules the checker applies (`assets/axes.json` `rules`): a different family and a different shape
from the previous video; at least 6 of the 15 kit choices different from each of the last five; at
least 5 different from other apps' recent kits; and the family must be the one the `music` axis
names. The brand profile narrows the field: `brand.sound.avoid` removes families (and their music
values) from this app's catalog, and `brand.sound.families` keeps only the ones it lists.

Match the kit to the register of the concept, not to habit. A calm tutorial with a trap kit and a
riser is the same mistake as a hype countdown over soft keys.

## Arrangement shapes

The `arrangement-shapes` block plays the bed. A build and a drop is one shape of seven; using it
every time is what made every video sound like the same record.

| Shape | Arc | Good for |
| --- | --- | --- |
| `build-drop` | filtered build, a gap of near-silence, the drop at the turn, a ringing final chord | a reveal that changes everything |
| `cold-open` | the full groove from beat one, one breakdown bar before the turn, then a top line | result-first openings, showreels |
| `stop-time` | one stab per bar with silence around it until the turn, then the groove arrives | lists, countdowns, deadpan |
| `pulse` | no drums: a bass pulse and an arpeggio that doubles after the turn | tutorials, one-shape morphs |
| `swell` | one long crescendo of layered chords and hits, no drop | single-take zooms, awe |
| `stomp` | percussion and bass only; harmony waits for the final chord | versus, rivalry, memes |
| `ui-only` | no bed; sound design on the grid carries the rhythm | ASMR loops, a supplied track |

`turn` is the bar where the story turns: the answer, the reveal, the payoff. Put it where the
script says it is, not at the midpoint by default. `endBar` is the bar of the final chord; pass
`null` for a seamless loop that should not resolve.

## Beat math

Plan the scenes first (each needs 1.5 s plus 0.3 s per word), then pick bars and BPM so the music
ends exactly on the last frame: `seconds = bars * 240 / bpm`. Stay under 45 s. `studio sound`
prints options inside the family's tempo range. Scene changes go on bar lines at any tempo.

| Length | Options (bars @ BPM) |
| --- | --- |
| 10 s | 5 @ 120, 4 @ 96 |
| 15 s | 8 @ 128, 6 @ 96, 5 @ 80 |
| 20 s | 10 @ 120, 8 @ 96, 12 @ 144 |
| 24 s | 12 @ 120, 10 @ 100, 9 @ 90 |
| 30 s | 16 @ 128, 15 @ 120, 12 @ 96, 20 @ 160 |
| 36 s | 18 @ 120, 15 @ 100, 12 @ 80 |
| 40 s | 20 @ 120, 16 @ 96, 28 @ 168 |

Set the grid once in `src/cues.mjs` with `beatGrid(bpm, bars)` and derive every cue from `b(n)`
and `step(bar, sixteenth)`. `KICKS` there is the list of hits the world pulses on;
`shapeKicks(grid, SOUND)` from `lib/grooves.mjs` suggests one for the kit's groove and shape.

## Writing soundtrack.mjs

```js
import { createMix } from './lib/synth.mjs';
import { designKit } from './lib/soundkit.mjs';
import { arrange } from './blocks/arrangement-shapes/index.mjs';
import { grid, CUE, KICKS, SOUND } from './src/cues.mjs';

const kit = designKit(meta.sound);                       // this video's instruments
const mix = createMix({ duration: grid.duration, seed: kit.spec.seed });
arrange(mix, grid, { kit, turn: SOUND.turn, endBar: SOUND.endBar, kicks: KICKS });

kit.sfx.impact(mix, CUE.hook, { size: 0.9 });            // then the sound design, cue by cue
kit.sfx.whoosh(mix, CUE.cardLands, { len: 0.7, pan: 0.3 });
kit.sfx.tick(mix, CUE.tap, { i: 0 });
kit.sfx.confirm(mix, CUE.saved);
kit.playMotif(mix, CUE.logo + 0.3, { step: grid.beat / 2 });
mix.render('out/soundtrack.wav');
```

The kit also exposes its instruments for parts the block does not play: `kit.chord(midis, len)`,
`kit.bass(midi, len)`, `kit.lead(midi, len)`, `kit.drum.snare()`, `kit.drum.hat()`,
`kit.drum.perc()`, `kit.scale(degree)`, `kit.chords`, `kit.roots`, `kit.tonic`. Write a melody on
the lead, a counter-line under a key scene, a fill before a cut. A bed plus four stock effects is
the minimum, not the goal.

## The sync map

Every visual event gets a sound, placed on the same cue, in the kit's voice:

| Visual | Sound |
| --- | --- |
| Word or number lands | `kit.sfx.impact` (small `size`), `kit.drum.snare()`, or a chord stab |
| Swipe, camera move, morph | `kit.sfx.whoosh(mix, landingTime)`: it swells into the landing |
| UI tap, key, toggle | `kit.sfx.tick` with a changing `i` so repeats do not sound robotic |
| Confirmation, success | `kit.sfx.confirm` (a short rising figure in key) |
| Counter rolls | a fast run of quiet ticks |
| Rank or level up | `kit.lead` notes climbing the scale: `kit.scale(1)`, `kit.scale(2)`, ... |
| Big reveal | `kit.sfx.impact` at full size plus a held `kit.chord` |
| Logo | `kit.playMotif`, the app's sonic logo |
| Domain flavor | `inst.bounce` and `inst.swish` (a ball), `inst.crowd` (an arena), `inst.vinyl`, or a new voice |

Add a domain sound when the app has one (a shutter for a photo app, a page turn for a reader, a
coin for a budget): build it as a small function in the video, or as a sound block when it will
recur, and record it in `brand.sound.domain`.

Transitions are 0.4 to 0.8 s, so stretch moves across the whole transition instead of a 0.2 s
zip, and keep the loudest hits for the accents.

## The sonic logo

Every app has a motif: three or four scale degrees and a rhythm (`brand.json` `sound.motif`, for
example `{ "degrees": [5, 8, 6, 5], "steps": [0, 2, 4, 6] }`). Without one, a stable motif is
derived from the app's name. `kit.playMotif` plays the same contour in every video, in that
video's key and lead voice. It is the one sound that should repeat: identity lives there, so
everything else is free to change.

## A supplied track

When the user gives you a track they may post with, measure it and cut the picture to it:

```bash
node beats.mjs ../../audio/track.mp3 --from 32 --seconds 40 > beats.json
```

It reports `bpm`, `offset` (seconds to the first downbeat of the excerpt), `beats`, `downbeats`,
and `hits`, with a confidence for the tempo and for the bar line. Use `beatGrid(bpm, bars)` with
its tempo, place the track so its downbeat lands on frame 0, and keep the kit for sound design
only (`music` axis `supplied-track`, kit shape `ui-only`):

```js
import { loadAudio } from './lib/synth.mjs';
mix.placeStereo(loadAudio('../../audio/track.mp3', { from: 32 + beats.offset, seconds: grid.duration }), 0, { gain: 0.9, stem: 'music' });
```

Scene changes go on `downbeats`, state changes on `beats`, sound design on `hits`. If the tempo
reads at half or double, rerun with `--min` and `--max`. Under 0.4 downbeat confidence
(percussion-only tracks have no chords to mark the bar), confirm the bar line on a spectrogram.
Never use a track the user did not supply; record its source in `post.md`.

## Voice

A voiceover or a talking character changes a video more than any instrument, and it needs a voice
tool. Use one only when the user has provided it (a connected text-to-speech tool, or a key in the
environment such as `ELEVENLABS_API_KEY`). Read keys from the environment by name; never write one
into a file, a script, or chat. Generate each line to `audio/vo/NN.wav`, place it with
`loadAudio`, and dip the music under it:

```js
mix.placeStereo(loadAudio('audio/vo/01.wav'), CUE.line1, { gain: 1, stem: 'sfx' });
mix.dip(CUE.line1, CUE.line1 + 2.4, 0.55);
```

Spoken words count toward the reading budget like on-screen copy, and on-screen text still has to
carry the idea for viewers with sound off. Record the voice and the lines in `meta.json` `voice`.
Without a voice tool, do not fake one.

## Stems

`mix.render()` writes the full mix and a music-free SFX stem (`soundtrack-sfx.wav`). The build
turns the stem into `*-sfx-only.mp4` so the video can be posted with a trending sound added in
the app. `kit.sfx` places on the `sfx` stem and the arrangement on `music`; keep your own parts
the same way (`stem: 'music'` for anything musical).

## Mix targets and verification

Targets for social platforms and phone speakers:

- Integrated loudness -14 LUFS and true peak at or under -1 dBTP. `build.mjs` normalizes with two
  pass loudnorm and records the measured values in `out/manifest.json`.
- Octave balance (`node analyze-audio.mjs out/soundtrack.wav "0-15"`): 60-120 Hz the loudest band,
  20-60 Hz 2 to 4 dB under it, 250-1000 Hz around -5 to -12 dB, 2-4 kHz around -14 to -22 dB,
  8-16 kHz around -18 to -26 dB. Phones reproduce almost nothing under 150 Hz, so a bass needs
  harmonics: every kit bass is folded into MIDI 36 to 47 and has them, and kick tails stay above
  57 Hz. Drumless kits (piano, glass) sit lighter in the low end; that is expected.
- If the sub band dominates, shorten impacts or lower their gain. If the top is dull, raise hats
  and ticks or the master shelf (`mix.render(out, { shelfDb })`).
- Check timing with a spectrogram: `ffmpeg -i out/soundtrack.wav -lavfi
  showspectrumpic=s=1800x600:scale=log:fscale=log -y out/spec.png`, then view it and confirm
  transients line up with the cue times and the arc matches the shape you chose.
- Measured similarity: `studio log <id> --status rendered` fingerprints the soundtrack (tonal
  balance, energy arc, rhythm, notes, texture) and `studio check <id>` compares it with every
  earlier one, here and for other apps. The same track scores 100 percent; different kits usually
  land near 40. At 78 percent or more the check fails; redesign with `studio sound <id> --reroll`
  rather than nudging gains. Compare any two files with
  `node analyze-audio.mjs a.wav --compare b.wav`.

## Being honest about audio

You cannot hear the mix. Say so when reporting, name what you verified (loudness, balance, sync,
measured distance from earlier soundtracks), and point the user to the SFX-only version if they
would rather use a licensed or trending track. Never claim the music "sounds great".
