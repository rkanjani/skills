// End card: the brand logo falls onto the world floor (a real 3D decal that moves with the camera),
// lands with a flash and sparks, then an eyebrow, a tagline, and a CTA button spring in.
// Pair it with a world overlay shockwave and a camera that settles top-down at the logo cue.
// The fall is one of the video's accent snaps. Hold the card at least 2 s after the CTA lands.
import { E, spring, norm, clamp, lerp, pulse, el, css, tf, vis, icon, ensureStyle, PACE } from '../../lib/core.mjs';
import { placeOnFloor, fitText } from '../../lib/kit.mjs';

const STYLE = `
.b-logo-wordmark { display: grid; place-items: center; border-radius: 60px; background: var(--brand); color: var(--brand-ink); white-space: nowrap; }
.b-endcard-eyebrow { left: 0; width: 1080px; text-align: center; font-size: 27px; }
.b-endcard-tagline { left: 0; width: 1080px; text-align: center; font-size: 64px; font-weight: 600; letter-spacing: -0.01em; color: var(--ink); }
.b-endcard-cta { left: 50%; overflow: hidden; }
`;

export function create(ctx, params = {}) {
  ensureStyle('logo-floor-drop', STYLE);
  const { brand, floor, ui, fx } = ctx;
  const {
    eyebrow = brand.cta?.fineprint ?? brand.category ?? '',
    tagline = brand.one_liner ?? '',
    cta = brand.cta?.url ?? brand.url ?? '',
    ctaIcon = 'arrowRight',
    cues = {},
    worldWidth = null,
    center = [0, 0],
    spin = -38,
    dropFactor = 1.1,
    flash = true,
    layout = {},
  } = params;
  const { logo: logoAt = 1, tagline: taglineAt = logoAt + 0.8, cta: ctaAt = logoAt + 1.5 } = cues;
  const { eyebrowTop = 700, taglineTop = 1150, ctaTop = 1272 } = layout;

  let logo;
  let lw;
  let lh;
  if (brand.logo?.file) {
    logo = el('img', '', floor);
    logo.src = brand.asset(brand.logo.file);
    lw = brand.logo.width ?? 800;
    lh = brand.logo.height ?? 300;
  } else {
    logo = el('div', 'display b-logo-wordmark', floor);
    logo.textContent = brand.name ?? '';
    lw = 900;
    lh = 260;
    // Size the wordmark to the plate (fitText measures unwrapped text), then fix the plate size.
    const size = fitText(logo, lw - 120, 170);
    css(logo, { fontSize: `${size}px`, lineHeight: `${lh}px` });
  }
  css(logo, { width: `${lw}px`, height: `${lh}px` });

  const eb = el('div', 'abs eyebrow b-endcard-eyebrow', ui);
  eb.textContent = eyebrow;
  css(eb, { top: `${eyebrowTop}px` });
  const tag = el('div', 'abs b-endcard-tagline', ui);
  tag.textContent = tagline;
  css(tag, { top: `${taglineTop}px` });
  const button = el('div', 'abs btn b-endcard-cta', ui);
  el('span', '', button).textContent = cta;
  if (ctaIcon) icon(button, ctaIcon, 40, { width: 2.6 });
  css(button, { top: `${ctaTop}px` });

  if (flash) {
    fx.flash({ at: logoAt, color: '#fff6e4', strength: 0.35, decay: 6 });
    fx.burst({ at: logoAt, x: 540, y: 960, color: brand.tokens?.accent ?? '#ffffff', count: 80, speed: 1800, seed: 808, size: 7, gravity: 500, life: 1.1 });
  }
  const start = logoAt - PACE.accent - 0.06;

  return {
    logo,
    update(t, frame) {
      const on = t >= start;
      vis(logo, on);
      vis(eb, t >= logoAt);
      vis(tag, t >= taglineAt - 0.1);
      vis(button, t >= ctaAt - 0.1);
      if (!on || !frame?.cam) return;
      const span = worldWidth ?? (frame.floorSpan ?? 60) * 0.62;
      const fall = norm(t, start, logoAt);
      let z = span * dropFactor * (1 - E.inQuad(fall));
      if (t > logoAt) z = span * 0.03 * Math.sin(Math.PI * clamp((t - logoAt) / 0.22)) * Math.exp(-(t - logoAt) * 6);
      const ok = placeOnFloor(logo, frame.cam, { w: lw, h: lh, worldW: span, center, angleDeg: frame.cam.yaw + spin * (1 - E.outCubic(fall)), z });
      logo.style.opacity = ok ? String(clamp(fall * 6)) : '0';
      logo.style.filter = `drop-shadow(0 0 ${Math.round(70 * pulse(t, logoAt, 2.2))}px var(--brand)) brightness(${(1 + 0.35 * pulse(t, logoAt, 5)).toFixed(3)})`;
      const e = E.outCubic(norm(t, logoAt + 0.15, logoAt + 0.65));
      tf(eb, { y: lerp(26, 0, e), o: e });
      const k = spring(t - (taglineAt - 0.06), { stiffness: 190, damping: 20 });
      tf(tag, { y: lerp(60, 0, k), o: clamp((t - taglineAt + 0.06) * 5), blur: lerp(10, 0, clamp((t - taglineAt) * 4)) });
      const c = spring(t - (ctaAt - 0.05), { stiffness: 210, damping: 18 });
      tf(button, { x: -button.offsetWidth / 2, s: lerp(0.6, 1, c), o: clamp((t - ctaAt + 0.05) * 5) });
    },
  };
}

export const DEMO_LEN = 4.2;
export const DEMO_CAMERA = { pitch: 90, dist: 316, yaw: 0 };
export function demo(ctx) {
  return create(ctx, { cues: { logo: 0.6, tagline: 1.4, cta: 2.1 } });
}
