// Bar 8: the logo drops onto center court, then the line and the call to action.
import { CUE } from './cues.mjs';
import { E, spring, norm, clamp, lerp, pulse, el, tf, vis, css, svgIcon, ICONS } from './core.mjs';
import { project } from './court.mjs';

const LOGO_SRC = '../../src/assets/draftkit-logo-transparent.png';
const LOGO_W = 751;
const LOGO_H = 332;
const WORLD_W = 37; // feet across center court
const WORLD_H = (WORLD_W * LOGO_H) / LOGO_W;

// Solve the 3x3 homography that maps the unit rectangle of an element to four screen points.
function homography(src, dst) {
  const A = [];
  const bvec = [];
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    bvec.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    bvec.push(v);
  }
  const n = 8;
  for (let c = 0; c < n; c += 1) {
    let pivot = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(A[r][c]) > Math.abs(A[pivot][c])) pivot = r;
    [A[c], A[pivot]] = [A[pivot], A[c]];
    [bvec[c], bvec[pivot]] = [bvec[pivot], bvec[c]];
    for (let r = c + 1; r < n; r += 1) {
      const f = A[r][c] / A[c][c];
      for (let k = c; k < n; k += 1) A[r][k] -= f * A[c][k];
      bvec[r] -= f * bvec[c];
    }
  }
  const h = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    let s = bvec[r];
    for (let k = r + 1; k < n; k += 1) s -= A[r][k] * h[k];
    h[r] = s / A[r][r];
  }
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function matrix3d(H) {
  const [a, b, c, d, e, f, g, h, i] = H;
  return `matrix3d(${a}, ${d}, 0, ${g}, ${b}, ${e}, 0, ${h}, 0, 0, 1, 0, ${c}, ${f}, 0, ${i})`;
}

function placeOnFloor(node, cam, w, h, center, angle, z) {
  // Match the camera basis for this yaw so the logo reads upright from above.
  const R = [Math.sin(angle), -Math.cos(angle)];
  const U = [Math.cos(angle), Math.sin(angle)];
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([u, v]) => {
    const du = (u - 0.5) * WORLD_W;
    const dv = (v - 0.5) * WORLD_H;
    return [center[0] + R[0] * du - U[0] * dv, center[1] + R[1] * du - U[1] * dv, z];
  });
  const screen = corners.map((p) => project(cam, p));
  if (screen.some((p) => !p)) return false;
  const H = homography([[0, 0], [w, 0], [w, h], [0, h]], screen.map((p) => [p.x, p.y]));
  node.style.transform = matrix3d(H);
  return true;
}

export function createEndcard(floorLayer, root, fx) {
  const shadow = el('div', 'abs', floorLayer);
  css(shadow, {
    left: '0', top: '0', width: `${LOGO_W}px`, height: `${LOGO_H}px`, transformOrigin: '0 0',
    borderRadius: '90px', background: 'rgba(0, 0, 0, 0.85)',
  });
  const logo = el('img', 'abs', floorLayer);
  logo.src = LOGO_SRC;
  css(logo, { left: '0', top: '0', width: `${LOGO_W}px`, height: `${LOGO_H}px`, transformOrigin: '0 0' });

  const eyebrow = el('div', 'abs fineprint', root);
  css(eyebrow, { top: '700px' });
  eyebrow.textContent = 'For Yahoo Fantasy Basketball';

  const tagline = el('div', 'abs tagline', root);
  css(tagline, { top: '1142px', fontSize: '66px' });
  const taglineWords = 'AI that knows your league.'.split(' ').map((w, i, arr) => {
    const span = el('span', '', tagline);
    span.textContent = w + (i < arr.length - 1 ? ' ' : '');
    css(span, { display: 'inline-block' });
    return span;
  });

  const cta = el('div', 'abs cta', root);
  css(cta, { top: '1266px', height: '118px', fontSize: '46px', padding: '0 52px 0 58px' });
  cta.innerHTML = `<span>draftkit.ai</span>${svgIcon(ICONS.arrowRight, 40, '#fff', 2.6)}`;
  const shine = el('i', '', cta);
  css(shine, {
    position: 'absolute', inset: '0', borderRadius: '999px', pointerEvents: 'none',
    background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.35) 50%, transparent 65%)',
    backgroundSize: '250% 100%',
  });
  css(cta, { overflow: 'hidden', position: 'absolute' });

  fx.flash({ at: CUE.logo, color: '#f4e6c8', strength: 0.4, decay: 6 });
  fx.burst({ at: CUE.logo, x: 540, y: 960, color: '#d4a24c', count: 90, speed: 1900, seed: 808, size: 7, spread: Math.PI * 2, gravity: 500, life: 1.1 });
  fx.burst({ at: CUE.logo, x: 540, y: 960, color: '#f4f1e8', count: 30, speed: 1300, seed: 809, size: 5, spread: Math.PI * 2, gravity: 400 });

  const start = CUE.logo - 0.3;

  return {
    update(t, frame) {
      const on = t >= start;
      vis(logo, on);
      vis(shadow, on);
      vis(eyebrow, t >= CUE.logo);
      vis(tagline, t >= CUE.tagline - 0.1);
      vis(cta, t >= CUE.cta - 0.1);
      if (!on || !frame?.cam) return;

      // Gravity drop onto the floor with a small settle.
      const fall = norm(t, start, CUE.logo);
      let z = 42 * (1 - E.inQuad(fall));
      if (t > CUE.logo) z = 0.9 * Math.sin(Math.PI * clamp((t - CUE.logo) / 0.22)) * Math.exp(-(t - CUE.logo) * 6);
      const angle = (Math.PI / 180) * (180 + lerp(-38, 0, E.outCubic(fall)) + (t > CUE.logo ? 0 : 0));
      const ok = placeOnFloor(logo, frame.cam, LOGO_W, LOGO_H, [0, 0], angle, z);
      logo.style.opacity = ok ? String(clamp(fall * 6)) : '0';
      placeOnFloor(shadow, frame.cam, LOGO_W, LOGO_H, [0.4, 0.3], angle, 0.01);
      shadow.style.opacity = String(0.55 * clamp(fall) * (1 - clamp((t - CUE.logo) * 3)));
      shadow.style.filter = `blur(${lerp(60, 6, fall).toFixed(1)}px)`;
      logo.style.filter = `drop-shadow(0 0 ${Math.round(70 * pulse(t, CUE.logo, 2.2))}px rgba(86, 38, 211, 0.9)) brightness(${(1 + 0.35 * pulse(t, CUE.logo, 5)).toFixed(3)})`;

      const eb = E.outCubic(norm(t, CUE.logo + 0.15, CUE.logo + 0.65));
      tf(eyebrow, { y: lerp(26, 0, eb), o: eb, s: 1 });
      eyebrow.style.letterSpacing = `${lerp(0.5, 0.2, eb).toFixed(3)}em`;

      taglineWords.forEach((w, i) => {
        const at = CUE.tagline - 0.06 + i * 0.1;
        const p = spring(t - at, { stiffness: 190, damping: 20 });
        tf(w, { y: lerp(60, 0, p), o: clamp((t - at) * 5), blur: lerp(10, 0, clamp((t - at) * 4)) });
      });

      const c = spring(t - (CUE.cta - 0.05), { stiffness: 210, damping: 18 });
      cta.style.left = '50%';
      tf(cta, { x: -cta.offsetWidth / 2, s: lerp(0.6, 1, c), o: clamp((t - CUE.cta + 0.05) * 5) });
      // A shine sweeps the button every 2.4 s while the card holds.
      const since = t - CUE.cta - 0.35;
      const sweep = since < 0 ? 0 : (since % 2.4) / 0.7;
      shine.style.backgroundPosition = `${lerp(160, -60, E.inOutSine(clamp(sweep)))}% 0`;
    },
  };
}

