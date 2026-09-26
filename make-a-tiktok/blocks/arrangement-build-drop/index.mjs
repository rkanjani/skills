// Music bed with a build and a drop, in any drum style: pads that open through the build, a tuned
// 808 per bar, light drums before the drop and a genre pattern after it, a snare roll and riser
// into a near-silent gap, the drop, and a ringing final chord. Kicks come from the video's shared
// KICKS list so the world can pulse on them. Sound design (whooshes, ticks, impacts) stays in the
// video's soundtrack.mjs.
import { inst, PROGRESSIONS } from '../../lib/synth.mjs';

export function arrange(mix, grid, params = {}) {
  const {
    progression = PROGRESSIONS.epicMinor,
    roots = [41, 41, 37, 39, 41, 37, 39, 41],
    style = 'trap',
    dropBar = Math.floor(grid.bars / 2),
    endBar = grid.bars - 1,
    finalChord = [53, 57, 60, 65, 69, 72],
    kicks = [],
    montageBars = [],
    gap = 0.23,
    riser = true,
    padGain = 0.42,
    bassGain = 0.5,
    buildHats = true,
  } = params;
  const { bar } = grid;
  const dropAt = dropBar * bar;
  const endAt = endBar === null ? null : endBar * bar;
  const lastPadBar = endBar === null ? grid.bars : endBar;
  const montage = new Set(montageBars);

  for (let k = 0; k < lastPadBar; k += 1) {
    const start = k * bar;
    const building = k < dropBar;
    const cutoff = building ? (t) => 380 + 2400 * ((start + t) / Math.max(bar, dropAt)) ** 2 : (t) => 3800 + 700 * Math.sin((2 * Math.PI * (start + t)) / (bar * 2));
    const [l, r] = inst.supersaw(progression[k % progression.length].map((m) => m + 12), bar + 0.05, { cutoff, q: 0.9, attack: k === dropBar ? 0.005 : 0.06, release: 0.08 });
    if (k === dropBar - 1 && gap > 0) {
      // Hush the pad for the gap before the drop.
      const cut = Math.round((dropAt - gap - start) * 48000);
      for (let i = Math.max(0, cut); i < l.length; i += 1) {
        const g = Math.max(0, 1 - (i - cut) / 2400);
        l[i] *= g;
        r[i] *= g;
      }
    }
    mix.placeStereo([l, r], start, { gain: building ? padGain * 1.15 : padGain * 0.85, send: 0.25, bus: 'duck' });
    const glide = k > dropBar ? roots[(k - 1) % roots.length] : null;
    mix.place(inst.sub808(roots[k % roots.length], bar * (k === dropBar - 1 ? 0.8 : 0.97), { glideFrom: glide, decay: building ? 1.3 : 2.2, drive: building ? 2.2 : 2.6 }), start, { gain: building ? bassGain : bassGain * 1.4, bus: 'duck' });
  }
  if (endAt !== null) {
    mix.placeStereo(inst.supersaw(finalChord, Math.max(1.2, grid.duration - endAt + 0.2), { cutoff: (t) => 5200 * Math.exp(-t / 1.4) + 700, attack: 0.004, release: 0.5 }), endAt, { gain: 0.5, send: 0.5 });
    mix.place(inst.sub808(roots[0], Math.min(1.6, grid.duration - endAt), { glideFrom: roots[(endBar - 1) % roots.length], decay: 1.2 }), endAt, { gain: bassGain, stem: 'music' });
  }

  for (const t of kicks) mix.kick(t, { p0: 180, decay: t >= dropAt ? 0.3 : 0.26 });

  for (let k = 1; k < lastPadBar; k += 1) {
    if (k < dropBar) {
      if (!buildHats) continue;
      const dense = k >= dropBar - 2;
      for (let s = 0; s < 16; s += dense ? 1 : 2) {
        if (k === dropBar - 1 && s >= 14) continue;
        mix.place(inst.hat(false), grid.step(k, s), { gain: (s % 4 === 0 ? 0.22 : 0.14), pan: 0.25, stem: 'music' });
      }
      if (k < dropBar - 1) mix.place(inst.clap(), grid.step(k, 8), { gain: 0.34, send: 0.3, stem: 'music' });
    } else {
      mix.drums(grid, k, montage.has(k) ? 'four' : style, { kicks: false });
    }
  }

  if (dropBar > 0) {
    const k = dropBar - 1;
    const hits = [];
    for (let s = 0; s < 8; s += 2) hits.push(grid.step(k, s));
    for (let s = 8; s < 12; s += 1) hits.push(grid.step(k, s));
    for (let s = 12; s < 14; s += 0.5) hits.push(grid.step(k, s));
    const playable = hits.filter((t) => t < dropAt - gap - 0.01);
    playable.forEach((t, i) => mix.place(inst.snare(0.12), t, { gain: 0.12 + 0.28 * (i / playable.length), pan: 0.1, send: 0.2, stem: 'music' }));
    if (riser) {
      mix.place(inst.riser(bar - gap + 0.05), k * bar, { gain: 0.22, send: 0.2, stem: 'music' });
      if (gap > 0) mix.place(inst.whoosh(gap, { f0: 300, f1: 7000, q: 0.9, shape: 'rise' }), dropAt - gap, { gain: 0.6, send: 0.1 });
    }
    mix.place(inst.crash(2.4), dropAt, { gain: 0.3, pan: -0.15, send: 0.3, stem: 'music' });
  }
  return { dropAt, endAt };
}
