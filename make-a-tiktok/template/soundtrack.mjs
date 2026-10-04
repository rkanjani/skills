#!/usr/bin/env node
// Score and sound design for this video, locked to src/cues.mjs. The sound kit is this video's
// own set of instruments, key, chords, groove, and sound-design voices: `studio sound <id>` designs
// one that differs from recent videos and stores it in meta.json `sound`. The bed comes from the
// arrangement-shapes block; the sound design below gives every visual hit a sound in the kit's voice.
//   node soundtrack.mjs out/soundtrack.wav     (also writes out/soundtrack-sfx.wav)
import fs from 'node:fs';
import { createMix } from './lib/synth.mjs';
import { designKit, describeKit, hashSeed } from './lib/soundkit.mjs';
import { arrange } from './blocks/arrangement-shapes/index.mjs';
import { grid, CUE, KICKS, SOUND } from './src/cues.mjs';
import { makeCopy } from './src/copy.mjs';

const out = process.argv[2] ?? 'out/soundtrack.wav';
const read = (file) => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));
const brand = read('../../brand/brand.json');
const meta = read('./meta.json');
const copy = makeCopy(brand);
const { beat } = grid;

// Without a stored design the kit is seeded from this video's identity, so even an untouched
// scaffold sounds different per app and per video. The app's sonic logo comes from the brand.
const kit = designKit({
  seed: hashSeed(`${meta.app}/${meta.id}/${meta.slug}`),
  groove: SOUND.groove,
  shape: SOUND.shape,
  ...(brand.sound?.motif ? { motif: brand.sound.motif } : {}),
  ...(meta.sound ?? {}),
});
if (kit.spec.groove !== SOUND.groove || kit.spec.shape !== SOUND.shape) {
  console.warn(`src/cues.mjs SOUND (${SOUND.groove}, ${SOUND.shape}) differs from the kit (${kit.spec.groove}, ${kit.spec.shape}): world pulses will not match the drums.`);
}
const mix = createMix({ duration: grid.duration, seed: kit.spec.seed });
const musical = kit.spec.shape !== 'ui-only';

arrange(mix, grid, { kit, turn: SOUND.turn, endBar: SOUND.endBar, kicks: KICKS });

// Hook: an impact on frame one, a hit on the slam, a move as it clears.
kit.sfx.impact(mix, 0, { size: 0.9 });
mix.place(kit.drum.snare(), CUE.hookSlam, { gain: 0.45, send: 0.35 });
kit.sfx.whoosh(mix, CUE.hookOut, { len: 0.6, dir: 'out', pan: -0.3 });

// Feature beats: a move across each camera turn, a chord stab and a confirmation as the title lands.
CUE.features.forEach((at, i) => {
  kit.sfx.whoosh(mix, at, { len: 0.9, gain: 0.36, pan: [0.5, -0.5, 0][i] });
  if (musical) mix.placeStereo(kit.chord(kit.chords[(i + 1) % kit.chords.length], 0.45), at, { gain: 1, send: 0.35 });
  kit.sfx.confirm(mix, at + 0.35, { gain: 0.09, notes: 2 });
});

// Payoff: a tick per word, then a move into the logo.
copy.payoff.forEach((_, w) => kit.sfx.tick(mix, CUE.payoff + w * beat + 0.02, { i: w, gain: 0.18 }));
kit.sfx.whoosh(mix, CUE.logo, { len: 0.4, gain: 0.5 });

// End card: the landing, the app's sonic logo under the tagline, a confirmation on the call to action.
kit.sfx.impact(mix, CUE.logo, { size: 1 });
kit.playMotif(mix, CUE.tagline, { step: beat / 2 });
kit.sfx.confirm(mix, CUE.cta, { gain: 0.08 });

mix.render(out);
console.log(describeKit(kit.spec).join('\n'));
