// World overlay: a field of dots (options, candidates, records) on the floor. Scan rings expand
// from an origin; each pass eliminates dots as the ring reaches them, finalists get labels and
// glide to their marks, and the last survivor sinks to a target with pulsing rings.
// Returns { pick: { x, y, r } } in screen space each frame so a card can open from the pick.
import { E, norm, clamp, lerp, rng, hexToRgb, PACE } from '../../lib/core.mjs';

export function createOverlay(ctx, params = {}) {
  const tokens = ctx.brand.tokens ?? {};
  const {
    count = 214,
    seed = 214,
    area = { x0: 2.5, x1: 46, y0: -23.5, y1: 23.5 },
    spacing = 1.9,
    origin = [41.75, 0],
    passes = [{ at: 1, keep: 38 }, { at: 1.5, keep: 3 }, { at: 2, keep: 1 }],
    finalists = [],
    sinkTo = origin,
    cues = {},
    ringMax = 52,
    ringDur = 0.6,
    dotSize = 0.5,
    font = `600 25px "${ctx.brand.fonts?.body?.family ?? 'sans-serif'}"`,
  } = params;
  const c = { in: passes[0].at - 0.8, out: Infinity, ...cues };
  const rand = rng(seed);
  const dots = [];
  for (let i = 0; i < count; i += 1) {
    let x;
    let y;
    let tries = 0;
    do {
      x = area.x0 + rand() * (area.x1 - area.x0);
      y = area.y0 + rand() * (area.y1 - area.y0);
      tries += 1;
    } while (tries < 20 && dots.some((d) => Math.hypot(d.x - x, d.y - y) < spacing));
    dots.push({ x, y, delay: rand() * 0.5, level: 0, key: rand(), phase: rand() * 100 });
  }
  // Survivors: a random first cut, then the ones nearest the origin keep advancing.
  const order = Array.from(dots.keys());
  order.sort((a, b) => dots[a].key - dots[b].key);
  let pool = order.slice(0, passes[0].keep);
  for (const i of pool) dots[i].level = 1;
  const distTo = (i) => Math.hypot(dots[i].x - origin[0], dots[i].y - origin[1]);
  for (let p = 1; p < passes.length; p += 1) {
    pool.sort((a, b) => distTo(a) - distTo(b));
    pool = pool.slice(0, passes[p].keep);
    for (const i of pool) dots[i].level = p + 1;
  }
  const L = passes.length;
  const finalIdx = [];
  dots.forEach((d, i) => {
    if (d.level >= L - 1) finalIdx.push(i);
  });
  finalIdx.sort((a, b) => dots[b].level - dots[a].level);
  finalIdx.forEach((i, k) => (dots[i].finalist = finalists[k] ?? { tag: '', home: [dots[i].x, dots[i].y] }));
  const pickIdx = finalIdx.find((i) => dots[i].level === L);
  if (pickIdx !== undefined) dots[pickIdx].isPick = true;
  const glideFrom = L >= 2 ? passes[L - 2].at + 0.2 : passes[0].at;

  const muted = hexToRgb(tokens.muted ?? '#b8b4a6');
  const accent = hexToRgb(tokens.accent ?? '#d4a24c');
  const light = accent.map((v) => Math.round(lerp(v, 255, 0.25)));
  const positive = hexToRgb(tokens.positive ?? '#3dcc7a');
  const rgba = (rgb, a) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;

  function reachedAt(d, t) {
    const dist = Math.hypot(d.x - origin[0], d.y - origin[1]);
    let reached = 0;
    let since = 0;
    passes.forEach((p, k) => {
      const arrive = p.at + ringDur * E.outCubic(clamp(dist / ringMax)) * 0.9;
      if (t >= arrive) {
        reached = k + 1;
        since = t - arrive;
      }
    });
    return { reached, since };
  }

  return (api, t) => {
    if (t < c.in - 0.1 || t > c.out) return {};
    // Gone by cues.out.
    const fade = 1 - E.inCubic(norm(t, c.out - 0.5, c.out));
    const labels = [];
    let pick = null;
    for (const d of dots) {
      const a = E.outBack(clamp((t - c.in - d.delay) / 0.4), 2.2);
      if (a <= 0) continue;
      const { reached, since } = reachedAt(d, t);
      const k = E.outCubic(clamp(since / 0.3));
      let { x, y } = d;
      if (d.finalist) {
        const glide = E.inOutCubic(norm(t, glideFrom, passes[L - 1].at + 0.3));
        x = lerp(d.x, d.finalist.home[0], glide);
        y = lerp(d.y, d.finalist.home[1], glide);
        if (d.level === L) {
          const sink = E.inOutCubic(norm(t, passes[L - 1].at + 0.35, passes[L - 1].at + 0.9));
          x = lerp(x, sinkTo[0], sink);
          y = lerp(y, sinkTo[1], sink);
        }
      }
      const alive = d.level >= reached;
      let r = dotSize;
      let color = muted;
      let alpha = 0.55;
      if (reached > 0) {
        if (!alive) {
          alpha = lerp(reached === 1 ? 0.55 : 0.95, 0.1, k);
          r = lerp(reached === 1 ? dotSize : dotSize * 1.24, dotSize * 0.72, k);
          color = reached === 1 ? muted : accent;
        } else if (reached === L) {
          color = positive;
          alpha = 1;
          r = dotSize * 1.7;
        } else if (reached === L - 1) {
          color = light;
          alpha = 1;
          r = lerp(dotSize * 1.24, dotSize * 1.56, k);
        } else {
          color = accent;
          alpha = lerp(0.55, 0.95, k);
          r = lerp(dotSize, dotSize * 1.24, k);
        }
      }
      const g = api.drawDisc(x, y, r * a, rgba(color, alpha * fade), 0.05);
      if (!g) continue;
      if (d.finalist && reached >= L - 1 && alive) {
        api.drawRing(x, y, dotSize * 2.9 + 0.25 * Math.sin(t * 9 + d.phase), 2, rgba(color, (reached === L ? 0.9 : 0.65) * fade));
        if (d.finalist.tag) labels.push({ x, y, tag: d.finalist.tag, pick: reached === L, a: fade * E.outCubic(clamp(since / 0.35)) });
      }
      if (d.isPick) {
        pick = { x: g.x, y: g.y, r: g.r };
        if (reached === L) {
          for (let w = 0; w < 3; w += 1) {
            const ph = t - passes[L - 1].at - 0.3 - w * 0.22;
            if (ph < 0) continue;
            const q = (ph % 0.66) / 0.66;
            api.drawRing(x, y, dotSize * 2 + q * 7, 3 * (1 - q), rgba(positive, 0.7 * (1 - q) * fade));
          }
        }
      }
    }
    passes.forEach((p) => {
      const q = norm(t, p.at, p.at + ringDur);
      if (q <= 0 || q >= 1) return;
      const radius = ringMax * E.outCubic(q);
      api.drawRing(origin[0], origin[1], radius, 5, rgba(accent, (1 - q) * 0.9 * 0.35));
      api.drawRing(origin[0], origin[1], radius, 2, `rgba(255, 245, 225, ${(1 - q) * 0.9})`);
    });
    for (const l of labels) {
      api.label(l.tag, l.x, l.y, {
        font,
        color: l.pick ? `rgb(${positive.join(', ')})` : tokens.ink ?? '#f4f1e8',
        border: l.pick ? rgba(positive, 0.55) : rgba(accent, 0.4),
        alpha: l.a,
        dx: 34,
      });
    }
    return { pick };
  };
}

export const DEMO_LEN = 4.2;
export const DEMO_CAMERA = { tx: 24, dist: 118, pitch: 90, yaw: 0 };
export function demoOverlay(ctx) {
  return createOverlay(ctx, {
    passes: [{ at: 1.0, keep: 38 }, { at: 2.0, keep: 3 }, { at: 3.0, keep: 1 }],
    finalists: [{ tag: 'Best pick', home: [39.3, 0] }, { tag: 'Runner-up', home: [33.8, 10.5] }, { tag: 'Third', home: [33.2, -10.8] }],
    cues: { in: 0.1 },
  });
}
export function demo() {
  return { update() {} };
}
