// Scenes compose building blocks from ../blocks (a snapshot of the library taken at scaffold time).
// Reuse a block when it fits, extend it when it almost fits, and create a new block (see
// references/building-blocks.md) when the script needs something that could recur.
import * as rise from '../blocks/rise-headline/index.mjs';
import * as feats from '../blocks/feature-beats/index.mjs';
import * as payoff from '../blocks/payoff-words/index.mjs';
import * as endcard from '../blocks/logo-floor-drop/index.mjs';
import { CUE, grid } from './cues.mjs';
import { makeCopy } from './copy.mjs';

export const hookScene = (ctx) => {
  const copy = makeCopy(ctx.brand);
  return rise.create(ctx, { lines: copy.hook, eyebrow: copy.eyebrow, cues: { start: -0.4, slam: CUE.hookSlam, out: CUE.hookOut } });
};

export const featureScene = (ctx) => feats.create(ctx, { items: makeCopy(ctx.brand).features, cues: { at: CUE.features, end: CUE.payoff } });

export const payoffScene = (ctx) => payoff.create(ctx, { words: makeCopy(ctx.brand).payoff, cues: { at: CUE.payoff, step: grid.beat, out: CUE.payoffOut } });

export const endScene = (ctx) => {
  const copy = makeCopy(ctx.brand);
  return endcard.create(ctx, {
    eyebrow: copy.fineprint || copy.eyebrow,
    tagline: copy.tagline,
    cta: copy.cta,
    worldWidth: ctx.brand.logo?.floorWidth ?? null,
    cues: { logo: CUE.logo, tagline: CUE.tagline, cta: CUE.cta },
  });
};
