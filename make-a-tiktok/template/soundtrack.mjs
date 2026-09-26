#!/usr/bin/env node
// Score and sound design for this video, locked to src/cues.mjs. The music bed comes from the
// arrangement-build-drop block; the sound design below gives every visual hit a sound.
//   node soundtrack.mjs out/soundtrack.wav     (also writes out/soundtrack-sfx.wav)
import fs from 'node:fs';
import { createMix, inst, PROGRESSIONS, noteHz } from './lib/synth.mjs';
import { arrange } from './blocks/arrangement-build-drop/index.mjs';
import { grid, CUE, KICKS } from './src/cues.mjs';
import { makeCopy } from './src/copy.mjs';

const out = process.argv[2] ?? 'out/soundtrack.wav';
const brand = JSON.parse(fs.readFileSync(new URL('../../brand/brand.json', import.meta.url), 'utf8'));
const copy = makeCopy(brand);
const mix = createMix({ duration: grid.duration, seed: 1337 });
const { beat } = grid;
const chords = PROGRESSIONS.epicMinor;

// Music bed: build through the hook and features, drop on the payoff, final chord on the logo.
arrange(mix, grid, { progression: chords, style: 'trap', dropBar: 8, endBar: 10, kicks: KICKS, gap: 0.2 });

// Hook: an impact on frame one, a hit on the slam, a soft whoosh as it clears.
mix.place(inst.boom(1.6, { from: 110 }), 0, { gain: 0.85, send: 0.25 });
mix.place(inst.crash(1.6), 0, { gain: 0.14, pan: 0.2, send: 0.2, stem: 'music' });
mix.place(inst.snare(0.3), CUE.hookSlam, { gain: 0.45, send: 0.35, stem: 'music' });
mix.place(inst.whoosh(0.6, { f0: 600, f1: 4000 }), CUE.hookOut - 0.5, { gain: 0.4, pan: -0.3 });

// Feature beats: a whoosh across each camera turn, a stab and a bell as the title lands.
CUE.features.forEach((at, i) => {
  mix.place(inst.whoosh(0.9, { f0: 400, f1: 5000, q: 1.1 }), at - 0.7, { gain: 0.36, pan: [0.5, -0.5, 0][i] });
  mix.placeStereo(inst.stab(chords[(i + 1) % 4].map((m) => m + 12), 0.45), at, { gain: 0.45, send: 0.35 });
  mix.place(inst.bell(noteHz(84 + i * 3), 0.8, { ratio: 2, index: 1.2, decay: 0.25 }), at + 0.35, { gain: 0.09, send: 0.45 });
});

// Payoff: a rising blip per word, then a whoosh into the logo.
copy.payoff.forEach((_, w) => mix.place(inst.blip(noteHz([77, 80, 84, 89, 92, 96, 101][w % 7])), CUE.payoff + w * beat + 0.02, { gain: 0.12, send: 0.3 }));
mix.place(inst.whoosh(0.3, { f0: 5000, f1: 300, q: 1.1 }), CUE.logo - 0.3, { gain: 0.55 });

// End card: the landing, then bells for the line and the call to action.
mix.place(inst.boom(2.2, { from: 130, tau: 0.3 }), CUE.logo, { gain: 1, send: 0.3 });
mix.place(inst.clap(), CUE.logo, { gain: 0.55, send: 0.6, stem: 'music' });
mix.place(inst.crash(2.0), CUE.logo, { gain: 0.26, pan: 0.15, send: 0.4, stem: 'music' });
[CUE.tagline, CUE.cta].forEach((at, i) => {
  [89 + i * 3, 93 + i * 3, 96 + i * 3].forEach((m, j) => mix.place(inst.bell(noteHz(m), 1, { ratio: 2, index: 1.1, decay: 0.35 }), at + j * 0.04, { gain: 0.07, send: 0.5, pan: -0.2 + j * 0.2 }));
});

mix.render(out);
