import { DURATION, H, W, clamp, el, css } from './core.mjs';
import { createWorld } from './court.mjs';
import { createFx } from './fx.mjs';
import { createScoreboard } from './scoreboard.mjs';
import { createChat } from './chat.mjs';
import { createMontage } from './montage.mjs';
import { createClimb } from './climb.mjs';
import { createEndcard } from './endcard.mjs';

const params = new URLSearchParams(location.search);
const rendering = params.has('render');

async function loadFonts() {
  const faces = [
    '800 100px "Barlow Condensed"',
    '700 100px "Barlow Condensed"',
    '600 100px "Barlow Condensed"',
    '900 100px "Barlow Condensed"',
    '400 40px "IBM Plex Sans"',
    '500 40px "IBM Plex Sans"',
    '600 40px "IBM Plex Sans"',
    '700 40px "IBM Plex Sans"',
    '600 40px "Poppins"',
    '700 40px "Poppins"',
  ];
  await Promise.all(faces.map((face) => document.fonts.load(face, 'DraftKit 0123456789')));
  await document.fonts.ready;
}

function fitViewport() {
  if (rendering) return;
  const viewport = document.getElementById('viewport');
  const controlsHeight = 52;
  const scale = Math.min(window.innerWidth / W, (window.innerHeight - controlsHeight) / H);
  viewport.style.transform = `scale(${scale})`;
  viewport.style.left = `${(window.innerWidth - W * scale) / 2}px`;
  document.body.style.height = '100vh';
}

async function boot() {
  await loadFonts();
  const stage = document.getElementById('stage');
  const worldCanvas = document.getElementById('world');
  const ui = document.getElementById('ui');
  const world = createWorld(worldCanvas);
  const fx = createFx(document.getElementById('fx'));
  // Floor decals sit between the court canvas and the UI, outside the UI perspective.
  const floor = el('div', '');
  css(floor, { position: 'absolute', inset: '0', overflow: 'hidden' });
  stage.insertBefore(floor, ui);

  const logo = new Image();
  logo.src = '../../src/assets/draftkit-logo-transparent.png';
  await logo.decode().catch(() => {});

  const modules = [
    createScoreboard(ui, fx),
    createChat(ui, fx),
    createMontage(ui),
    createClimb(ui, fx),
    createEndcard(floor, ui, fx),
  ];
  await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));

  const seek = (t) => {
    const time = clamp(t, 0, DURATION - 1e-4);
    const frame = world.draw(time);
    for (const module of modules) module.update(time, frame);
    fx.draw(time);
  };

  window.seek = seek;
  window.__ready = true;

  if (rendering) {
    seek(Number(params.get('t') ?? 0));
    return;
  }

  const controls = document.getElementById('controls');
  const scrub = document.getElementById('scrub');
  const clock = document.getElementById('clock');
  const playButton = document.getElementById('play');
  controls.hidden = false;
  fitViewport();
  window.addEventListener('resize', fitViewport);

  const audio = new Audio('./out/soundtrack.wav');
  let playing = false;
  let startedAt = 0;
  let offset = Number(params.get('t') ?? 0);

  const show = (t) => {
    seek(t);
    scrub.value = String(t);
    clock.textContent = `${t.toFixed(2)}s`;
  };

  const tick = () => {
    if (!playing) return;
    const t = (offset + (performance.now() - startedAt) / 1000) % DURATION;
    show(t);
    requestAnimationFrame(tick);
  };

  playButton.addEventListener('click', () => {
    playing = !playing;
    playButton.textContent = playing ? 'Pause' : 'Play';
    if (playing) {
      offset = Number(scrub.value) % DURATION;
      startedAt = performance.now();
      audio.currentTime = offset;
      audio.play().catch(() => {});
      requestAnimationFrame(tick);
    } else {
      offset = Number(scrub.value);
      audio.pause();
    }
  });

  audio.addEventListener('timeupdate', () => {
    if (playing && audio.currentTime < 0.05) startedAt = performance.now();
  });

  scrub.addEventListener('input', () => {
    playing = false;
    playButton.textContent = 'Play';
    audio.pause();
    show(Number(scrub.value));
  });

  show(offset);
}

boot();
