// Foreground effects: deterministic particle bursts, light flashes, and streaks.
import { W, H, clamp, norm, E, rng, hexToRgb } from './core.mjs';

export function createFx(canvas) {
  const ctx = canvas.getContext('2d');
  const bursts = [];
  const flashes = [];
  const streaks = [];

  // Sparks thrown from a point. Physics is closed-form so any frame can be drawn directly.
  function burst({ at, x, y, color = '#3dcc7a', count = 40, speed = 900, spread = Math.PI * 2, dir = -Math.PI / 2,
    life = 0.9, gravity = 1400, size = 6, seed = 1, drag = 2.2 }) {
    const rand = rng(seed);
    const parts = Array.from({ length: count }, () => {
      const a = dir + (rand() - 0.5) * spread;
      const v = speed * (0.35 + rand() * 0.75);
      return {
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: life * (0.55 + rand() * 0.6),
        size: size * (0.5 + rand() * 0.9),
        streak: rand() < 0.6,
      };
    });
    bursts.push({ at, x, y, rgb: hexToRgb(color), parts, gravity, drag });
  }

  function flash({ at, color = '#ffffff', strength = 0.5, decay = 9, attack = 0.02 }) {
    flashes.push({ at, rgb: hexToRgb(color), strength, decay, attack });
  }

  // A soft horizontal light sweep, used on whips.
  function streak({ at, dur = 0.3, y = H / 2, color = '#d4a24c', height = 520, strength = 0.35, dir = 1 }) {
    streaks.push({ at, dur, y, rgb: hexToRgb(color), height, strength, dir });
  }

  function draw(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    for (const b of bursts) {
      const dt = t - b.at;
      if (dt < 0 || dt > 2) continue;
      for (const p of b.parts) {
        if (dt > p.life) continue;
        // Velocity decays exponentially with drag; position integrates in closed form.
        const k = (1 - Math.exp(-b.drag * dt)) / b.drag;
        const x = b.x + p.vx * k;
        const y = b.y + p.vy * k + 0.5 * b.gravity * dt * dt * 0.6;
        const fade = 1 - dt / p.life;
        const a = clamp(fade * 1.2) * 0.95;
        const [r, g, bl] = b.rgb;
        if (p.streak) {
          const vxNow = p.vx * Math.exp(-b.drag * dt);
          const vyNow = p.vy * Math.exp(-b.drag * dt) + b.gravity * dt * 0.6;
          const len = 0.035;
          ctx.strokeStyle = `rgba(${r}, ${g}, ${bl}, ${a})`;
          ctx.lineWidth = p.size * 0.55 * fade + 0.8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - vxNow * len, y - vyNow * len);
          ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(${r}, ${g}, ${bl}, ${a})`;
          ctx.beginPath();
          ctx.arc(x, y, p.size * 0.5 * (0.4 + 0.6 * fade), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    for (const s of streaks) {
      const p = norm(t, s.at, s.at + s.dur);
      if (p <= 0 || p >= 1) continue;
      const cx = s.dir > 0 ? -300 + (W + 600) * E.inOutCubic(p) : W + 300 - (W + 600) * E.inOutCubic(p);
      const g = ctx.createLinearGradient(cx - 380, 0, cx + 380, 0);
      const [r, gg, bl] = s.rgb;
      const a = Math.sin(p * Math.PI) * s.strength;
      g.addColorStop(0, `rgba(${r}, ${gg}, ${bl}, 0)`);
      g.addColorStop(0.5, `rgba(${r}, ${gg}, ${bl}, ${a})`);
      g.addColorStop(1, `rgba(${r}, ${gg}, ${bl}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(cx - 380, s.y - s.height / 2, 760, s.height);
    }

    ctx.globalCompositeOperation = 'source-over';
    for (const f of flashes) {
      const dt = t - f.at;
      if (dt < -f.attack || dt > 1.2) continue;
      const a = dt < 0 ? f.strength * (1 + dt / f.attack) : f.strength * Math.exp(-dt * f.decay);
      if (a < 0.003) continue;
      const [r, g, bl] = f.rgb;
      ctx.fillStyle = `rgba(${r}, ${g}, ${bl}, ${a})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  return { burst, flash, streak, draw };
}
