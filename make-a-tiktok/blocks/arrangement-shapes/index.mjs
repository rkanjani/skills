// Music bed for soundtrack.mjs, played by a sound kit (lib/soundkit.mjs) in one of several shapes,
// so two videos never share an arc and an instrument set by default:
//
//   build-drop  filtered build, a gap of near-silence, the drop at the turn, a ringing final chord
//   cold-open   the full groove from beat one, one breakdown bar before the turn, then a top line
//   stop-time   one stab per bar with silence around it until the turn, then the groove arrives
//   pulse       no drums: a bass pulse and an arpeggio that doubles after the turn
//   swell       one long crescendo of layered chords and hits, no drop
//   stomp       percussion and bass only; harmony waits for the final chord
//   ui-only     no bed at all; the video's sound design carries the rhythm
//
// `turn` is the bar where the story turns (the reveal, the answer, the payoff). Kicks come from the
// video's shared KICKS list so the world pulses on them (lib/grooves.mjs `shapeKicks` suggests a
// list per shape). Sound design (impacts, moves, ticks, the sonic logo) stays in soundtrack.mjs.
import { inst } from '../../lib/synth.mjs';

export function arrange(mix, grid, params = {}) {
  const { kit } = params;
  if (!kit) throw new Error('arrangement-shapes needs a kit: designKit(meta.sound) from lib/soundkit.mjs');
  const {
    shape = kit.spec.shape,
    turn = Math.floor(grid.bars / 2),
    endBar = grid.bars - 1,
    kicks = [],
    gap = 0.22,
    level = 1,
    melody: withMelody = true,
    pulseGain = 0.3,
  } = params;
  const { bar, step } = grid;
  const turnAt = turn * bar;
  const endAt = endBar === null ? null : endBar * bar;
  const last = endBar === null ? grid.bars : endBar;
  const chordAt = (k) => kit.chords[k % kit.chords.length];
  const rootAt = (k) => kit.roots[k % kit.roots.length];
  if (shape === 'ui-only') return { turnAt, endAt };

  // Fade a buffer (or stereo pair) to silence from an absolute time.
  const hush = (buf, start, cutAt) => {
    if (cutAt === null || cutAt === undefined) return buf;
    const cut = Math.round((cutAt - start) * 48000);
    for (const ch of Array.isArray(buf) ? buf : [buf]) for (let i = Math.max(0, cut); i < ch.length; i += 1) ch[i] *= Math.max(0, 1 - (i - cut) / 2000);
    return buf;
  };

  function harmony(k, { gain = 1, open = 1, hushAt = null, octave = 0, stab = false } = {}) {
    const start = k * bar;
    const notes = chordAt(k).map((m) => m + octave);
    if (stab) {
      mix.placeStereo(kit.chord(notes, bar * (kit.sustained ? 0.22 : 0.6)), start, { gain: gain * 1.25 * level, send: 0.35 });
      return;
    }
    if (kit.sustained) {
      mix.placeStereo(hush(kit.chord(notes, bar + 0.05, { open }), start, hushAt), start, { gain: gain * level, send: 0.25, bus: 'duck' });
      return;
    }
    const again = notes.map((m, i) => (i === notes.length - 1 ? m + 12 : m));
    const at2 = step(k, kit.spec.restrike);
    mix.placeStereo(hush(kit.chord(notes, bar * 0.9, { open }), start, hushAt), start, { gain: gain * level, send: 0.35, bus: 'duck' });
    if (hushAt === null || at2 < hushAt - 0.05) mix.placeStereo(hush(kit.chord(again, bar * 0.5, { open }), at2, hushAt), at2, { gain: gain * 0.45 * level, send: 0.4, bus: 'duck' });
  }

  function bassline(k, { gain = 1, soft = false, pattern = kit.spec.bassPattern, hushAt = null } = {}) {
    const root = rootAt(k);
    const sixteenth = grid.beat / 4;
    const notes = {
      hold: [[0, root, bar * 0.97]],
      two: [[0, root, bar * 0.45], [8, root, bar * 0.4]],
      'root-fifth': [[0, root, bar * 0.5], [10, root + 7, bar * 0.18]],
      pulse8: [0, 2, 4, 6, 8, 10, 12, 14].map((s) => [s, root, sixteenth * 1.8]),
      offbeat: [2, 6, 10, 14].map((s) => [s, root, sixteenth * 1.9]),
      syncop: [[0, root, sixteenth * 5.5], [6, root, sixteenth * 4.5], [11, root, sixteenth * 4.5]],
    }[pattern] ?? [[0, root, bar * 0.97]];
    for (const [s, midi, len] of notes) {
      const at = step(k, s);
      if (hushAt !== null && at > hushAt - 0.05) continue;
      mix.place(hush(kit.bass(midi, len, { soft }), at, hushAt), at, { gain: 0.5 * gain * (s === 0 ? 1 : 0.8) * level, bus: 'duck' });
    }
  }

  function arp(k, { rate = 2, gain = 1 } = {}) {
    const chord = chordAt(k);
    const order = { up: [0, 1, 2, 3], down: [3, 2, 1, 0], updown: [0, 1, 2, 3, 2, 1], skip: [0, 2, 1, 3] }[kit.spec.arp] ?? [0, 1, 2, 3];
    for (let s = 0, i = 0; s < 16; s += rate, i += 1) {
      mix.place(kit.lead(chord[order[i % order.length]] + 12, 0.32), step(k, s), { gain: 0.06 * gain * (s % 4 === 0 ? 1.2 : 0.85) * level, pan: i % 2 ? 0.3 : -0.3, send: 0.4, stem: 'music' });
    }
  }

  function melody(k, gain = 1) {
    if (!withMelody) return;
    const chord = chordAt(k);
    const tones = [chord[3] + 12, chord[2] + 12, chord[1] + 12, chord[3] + 12];
    kit.spec.melody.forEach((s, i) => mix.place(kit.lead(tones[(i + k) % tones.length], 0.7), step(k, s), { gain: 0.075 * gain * level, pan: 0.2, send: 0.5, stem: 'music' }));
  }

  const drums = (k, lvl = 1, opts = {}) => kit.groove(mix, grid, k, { level: lvl * level, kicks: false, ...opts });
  const drumless = shape === 'pulse' || shape === 'swell';

  if (kit.spec.bed === 'vinyl') mix.place(inst.vinyl(grid.duration), 0, { gain: 0.45 * level, stem: 'music' });
  for (const t of kicks) kit.kick(mix, t, (drumless ? pulseGain : t >= turnAt ? 1 : 0.85) * level);

  if (shape === 'cold-open') {
    for (let k = 0; k < last; k += 1) {
      const breakdown = k === turn - 1 && turn > 1;
      harmony(k, { gain: 0.9, open: breakdown ? (t) => 0.75 - 0.4 * (t / bar) : 1 });
      if (breakdown) {
        // Drums and bass drop out; a pickup on the last beat hands back to the groove.
        [12, 13, 14, 15].forEach((s, i) => mix.place(kit.drum.perc(i), step(k, s), { gain: (0.14 + 0.05 * i) * level, send: 0.25, stem: 'music' }));
        continue;
      }
      bassline(k, { gain: 1.1 });
      drums(k, k < turn ? 0.9 : 1);
      if (k >= turn) melody(k);
    }
    if (turn > 1) mix.place(inst.crash(2), turnAt, { gain: 0.22 * level, pan: -0.15, send: 0.3, stem: 'music' });
  } else if (shape === 'stop-time') {
    for (let k = 0; k < last; k += 1) {
      if (k < turn) {
        harmony(k, { stab: true, gain: 0.9 });
        mix.place(kit.bass(rootAt(k), bar * 0.3), k * bar, { gain: 0.55 * level, bus: 'duck' });
        [14, 15].forEach((s, i) => mix.place(kit.drum.perc(i), step(k, s), { gain: 0.14 * level, send: 0.2, stem: 'music' }));
        continue;
      }
      harmony(k, { gain: 0.9 });
      bassline(k, { gain: 1.2 });
      drums(k);
      if (k > turn) melody(k);
    }
  } else if (shape === 'pulse') {
    for (let k = 0; k < last; k += 1) {
      const after = k >= turn;
      harmony(k, { gain: after ? 0.85 : 0.75, open: after ? 1 : 0.6 });
      bassline(k, { gain: 0.9, pattern: after ? 'two' : 'hold', soft: !after });
      arp(k, { rate: after ? 1 : 2, gain: after ? 1 : 0.85 });
      if (after) {
        melody(k);
        kit.groove(mix, grid, k, { level: 0.45 * level, kicks: false, name: 'four', thin: true });
      }
    }
  } else if (shape === 'swell') {
    for (let k = 0; k < last; k += 1) {
      const p = last > 1 ? k / (last - 1) : 1;
      harmony(k, { gain: 0.5 + 0.6 * p, open: 0.4 + 0.6 * p });
      if (kit.sustained && p > 0.3) harmony(k, { gain: 0.3 * p, octave: 12, open: 0.5 + 0.5 * p });
      bassline(k, { gain: 0.6 + 0.6 * p, pattern: 'hold', soft: p < 0.5 });
      const hits = p > 0.8 ? [0, 4, 8, 12] : p > 0.45 ? [0, 8] : [0];
      hits.forEach((s, i) => mix.place(kit.drum.perc(i), step(k, s), { gain: (0.12 + 0.3 * p) * level, send: 0.35, stem: 'music' }));
      if (p > 0.5) mix.place(kit.lead(chordAt(k)[2] + 12, bar * 0.95), k * bar, { gain: 0.05 * level, pan: 0.2, send: 0.5, stem: 'music' });
    }
    mix.place(inst.crash(2.4), turnAt, { gain: 0.16 * level, pan: 0.15, send: 0.35, stem: 'music' });
  } else if (shape === 'stomp') {
    for (let k = 0; k < last; k += 1) {
      drums(k, k < turn ? 0.9 : 1.1);
      bassline(k, { gain: 1.1, pattern: k < turn ? 'hold' : 'two' });
      if (k >= turn) melody(k, 1.2);
    }
  } else {
    // build-drop
    for (let k = 0; k < last; k += 1) {
      const building = k < turn;
      const hushAt = k === turn - 1 && gap > 0 ? turnAt - gap : null;
      const open = building ? (t) => 0.28 + 0.6 * ((k * bar + t) / Math.max(bar, turnAt)) ** 2 : 1;
      harmony(k, { gain: building ? 1.1 : 0.9, open, hushAt });
      bassline(k, { gain: building ? 0.85 : 1.3, soft: building, pattern: building ? 'hold' : kit.spec.bassPattern, hushAt });
      if (building && k >= 1 && k < turn - 1) drums(k, 0.8, { thin: true });
      if (!building) {
        drums(k);
        if (k > turn) melody(k);
      }
    }
    if (turn > 0) {
      const k = turn - 1;
      const hits = [0, 2, 4, 6, 8, 9, 10, 11, 12, 12.5, 13, 13.5].map((s) => step(k, s)).filter((t) => t < turnAt - gap - 0.01);
      hits.forEach((t, i) => mix.place(kit.drum.snare(), t, { gain: (0.1 + 0.26 * (i / hits.length)) * level, pan: 0.1, send: 0.2, stem: 'music' }));
      kit.sfx.riser(mix, k * bar, bar - gap, { gain: 0.22 * level });
      mix.place(inst.crash(2.4), turnAt, { gain: 0.28 * level, pan: -0.15, send: 0.3, stem: 'music' });
    }
  }

  if (endAt !== null) {
    const ring = Math.max(1.2, grid.duration - endAt + 0.2);
    const final = [...kit.tonic, kit.tonic[1] + 12, kit.tonic[2] + 12];
    mix.placeStereo(kit.chord(final, ring), endAt, { gain: 1.15 * level, send: 0.5 });
    mix.place(kit.bass(kit.tonic[0], Math.min(1.6, grid.duration - endAt)), endAt, { gain: 0.5 * level, stem: 'music' });
  }
  return { turnAt, endAt };
}
