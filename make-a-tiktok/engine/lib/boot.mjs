// Runtime: loads the studio brand, builds the layer stack, wires the world and scenes to
// window.seek(t) for the renderer, and offers a scrubbable preview when opened in a browser.
//
// Layer order (back to front): world canvas, floor decals, UI (with CSS perspective), fx canvas,
// vignette. Scenes receive { ui, floor, fx, brand, asset(path) }.

import { W, H, clamp, el, css } from './core.mjs';
import { createFx } from './fx.mjs';

const TOKEN_VARS = {
  bg: '--bg',
  panel: '--panel',
  panel2: '--panel2',
  ink: '--ink',
  muted: '--muted',
  line: '--line',
  accent: '--accent',
  brand: '--brand',
  brandInk: '--brand-ink',
  positive: '--positive',
  warning: '--warning',
  negative: '--negative',
};

export async function loadBrand(url = '../../brand/brand.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Brand profile not found at ${url}`);
  const brand = await res.json();
  const base = new URL(url, location.href);
  brand.asset = (p) => (p ? new URL(p, base).href : null);
  return brand;
}

function applyBrand(brand) {
  const root = document.documentElement.style;
  for (const [key, cssVar] of Object.entries(TOKEN_VARS)) {
    if (brand.tokens?.[key]) root.setProperty(cssVar, brand.tokens[key]);
  }
  const fonts = brand.fonts ?? {};
  if (fonts.display?.family) root.setProperty('--font-display', `'${fonts.display.family}', ${fonts.display.fallback ?? 'sans-serif'}`);
  if (fonts.body?.family) root.setProperty('--font-body', `'${fonts.body.family}', ${fonts.body.fallback ?? 'system-ui, sans-serif'}`);
  const type = brand.type ?? {};
  if (type.displayWeight) root.setProperty('--display-weight', String(type.displayWeight));
  if (type.displayTracking) root.setProperty('--display-tracking', type.displayTracking);
  if (type.displayCase) root.setProperty('--display-case', type.displayCase);
  if (type.radius) root.setProperty('--radius', type.radius);
  // The @font-face rules must be parsed before document.fonts.load() can find them, so wait for
  // the stylesheet itself. Without this the first frames render in a fallback font.
  const waits = [];
  if (fonts.css) {
    const link = el('link', '', document.head);
    link.rel = 'stylesheet';
    waits.push(new Promise((resolve) => {
      link.onload = resolve;
      link.onerror = () => {
        console.warn(`Font stylesheet failed to load: ${fonts.css}`);
        resolve();
      };
    }));
    link.href = fonts.css;
  }
  for (const face of fonts.files ?? []) {
    const style = el('style', '', document.head);
    style.textContent = `@font-face { font-family: '${face.family}'; src: url('${brand.asset(face.file)}'); font-weight: ${face.weight ?? 400}; font-style: ${face.style ?? 'normal'}; }`;
  }
  return Promise.all(waits);
}

async function loadFonts(brand) {
  const fonts = brand.fonts ?? {};
  const wanted = [];
  for (const role of ['display', 'body', 'mono']) {
    const f = fonts[role];
    if (!f?.family) continue;
    for (const weight of f.weights ?? [400, 700]) wanted.push(`${weight} 64px "${f.family}"`);
  }
  // Fonts must be ready before any text is measured or captured. Give up after 20s so an offline
  // render fails loudly in the review sheet instead of hanging forever.
  const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), 20000));
  const loaded = Promise.all(wanted.map((w) => document.fonts.load(w, 'Aa0123'))).then(() => document.fonts.ready);
  if ((await Promise.race([loaded, timeout])) === 'timeout') console.warn('Brand fonts did not load; check brand.fonts.css');
  for (const w of wanted) if (!document.fonts.check(w, 'Aa0123')) console.warn(`Font not available, falling back: ${w}`);
}

function buildStage() {
  document.body.textContent = '';
  const viewport = el('div', '', document.body);
  viewport.id = 'viewport';
  const stage = el('div', '', viewport);
  stage.id = 'stage';
  const world = el('canvas', '', stage);
  world.id = 'world';
  world.width = W;
  world.height = H;
  const floor = el('div', '', stage);
  floor.id = 'floor';
  const ui = el('div', '', stage);
  ui.id = 'ui';
  const fx = el('canvas', '', stage);
  fx.id = 'fx';
  fx.width = W;
  fx.height = H;
  const grade = el('div', '', stage);
  grade.id = 'grade';
  return { viewport, stage, world, floor, ui, fx, grade };
}

// options: { duration, brandUrl?, world?: (canvas, ctx) => { draw(t) }, scenes: [(ctx) => { update(t, frame) }], vignette? }
export async function boot({ duration, brandUrl, world: makeWorld = null, scenes: factories = [], vignette = true, audio = './out/soundtrack.wav' }) {
  const params = new URLSearchParams(location.search);
  const rendering = params.has('render');
  const brand = await loadBrand(brandUrl);
  await applyBrand(brand);
  await loadFonts(brand);

  const layers = buildStage();
  if (!vignette) layers.grade.remove();
  const fx = createFx(layers.fx);
  const ctx = { ...layers, fx, brand, asset: brand.asset, duration };
  const world = makeWorld ? makeWorld(layers.world, ctx) : null;
  // Factories run in order (synchronous DOM building keeps stacking order); async ones are awaited.
  const scenes = await Promise.all(factories.map((factory) => factory(ctx)));
  await Promise.all([...document.images].map((img) => img.decode().catch(() => console.warn(`Image failed: ${img.src}`))));

  const seek = (t) => {
    const time = clamp(t, 0, duration - 1e-4);
    const frame = world ? world.draw(time) : {};
    for (const scene of scenes) scene.update(time, frame);
    fx.draw(time);
  };
  window.seek = seek;
  window.DURATION = duration;
  window.__ready = true;

  if (rendering) {
    seek(Number(params.get('t') ?? 0));
    return;
  }
  startPreview(layers.viewport, seek, duration, audio, Number(params.get('t') ?? 0));
}

function startPreview(viewport, seek, duration, audioUrl, start) {
  const controls = el('div', '', document.body);
  controls.id = 'controls';
  const play = el('button', '', controls);
  play.type = 'button';
  play.textContent = 'Play';
  const scrub = el('input', '', controls);
  Object.assign(scrub, { type: 'range', min: '0', max: String(duration), step: '0.001', value: String(start) });
  const clock = el('output', '', controls);

  const fit = () => {
    const scale = Math.min(window.innerWidth / W, (window.innerHeight - 52) / H);
    css(viewport, { transform: `scale(${scale})`, left: `${(window.innerWidth - W * scale) / 2}px` });
  };
  fit();
  window.addEventListener('resize', fit);

  const audio = new Audio(audioUrl);
  let playing = false;
  let startedAt = 0;
  let offset = start;
  const show = (t) => {
    seek(t);
    scrub.value = String(t);
    clock.textContent = `${t.toFixed(2)}s`;
  };
  const tick = () => {
    if (!playing) return;
    show((offset + (performance.now() - startedAt) / 1000) % duration);
    requestAnimationFrame(tick);
  };
  play.addEventListener('click', () => {
    playing = !playing;
    play.textContent = playing ? 'Pause' : 'Play';
    if (playing) {
      offset = Number(scrub.value) % duration;
      startedAt = performance.now();
      audio.currentTime = offset;
      audio.play().catch(() => {});
      requestAnimationFrame(tick);
    } else {
      audio.pause();
    }
  });
  audio.addEventListener('timeupdate', () => {
    if (playing && audio.currentTime < 0.05) startedAt = performance.now();
  });
  scrub.addEventListener('input', () => {
    playing = false;
    play.textContent = 'Play';
    audio.pause();
    show(Number(scrub.value));
  });
  show(start);
}
