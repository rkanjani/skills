import { boot } from '../lib/boot.mjs';
import { grid } from './cues.mjs';
import { makeWorld } from './world.mjs';
import { hookScene, featureScene, payoffScene, endScene } from './scenes.mjs';

// Scenes update in order every frame; later scenes draw on top.
boot({
  duration: grid.duration,
  world: makeWorld,
  scenes: [hookScene, featureScene, payoffScene, endScene],
});
