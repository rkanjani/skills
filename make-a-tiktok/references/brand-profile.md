# Brand profile

`brand/brand.json` is the single source of the app's look, voice, and features for every video in
a studio. Build it once per app with care; every later run inherits it. Start from
`assets/brand.template.json` (copied by `studio.mjs init`).

## Contents

- Where to look in a repository
- From a website only
- Field guide
- Choosing the world
- Personas and features drive variation

## Where to look in a repository

Read, do not guess. Record every file you used in `sources`.

- Colors: CSS custom properties (`:root`, `.dark`), Tailwind theme (`tailwind.config.*`,
  `@theme` blocks), design token files, marketing or landing page styles (often the most
  expressive palette). Map them to the token roles below; prefer the dark palette for motion.
- Fonts: `index.html` or layout `<link>` tags to Google Fonts, `@font-face` rules, `next/font`
  calls. Copy the Google Fonts CSS URL into `fonts.css`, or copy local font files into
  `brand/assets/fonts/` and list them in `fonts.files`.
- Logo and icon: `public/`, `src/assets/`, `app/icon.*`, favicon and Open Graph images. Prefer a
  transparent PNG or SVG wordmark; copy it into `brand/assets/` and record its pixel size.
- Icons: which icon library the UI uses (Lucide, Heroicons, SF Symbols). The engine ships Lucide.
- Features and proof: the landing page, onboarding, route and page names, README, and in-app
  empty states. Each feature needs a one-line proof in the app's own words and a `ui` note
  describing what its real screen shows, so mocks stay faithful.
- Voice: marketing copy, and repository rules for user-facing copy (AGENTS.md, CLAUDE.md, style
  guides). Put forbidden characters or phrases in `voice.banned` (for example an em dash), and
  the checker will enforce them.
- Audience: hero copy, pricing page, app store description.

## From a website only

Use a browser tool to read the site's text and computed styles (colors, fonts). Downloading logo
files needs the user's permission; ask for the assets or for the repository when you do not have
them. Never invent a logo.

## Field guide

- `app`, `name`, `url`, `category` (2 to 4 words), `one_liner` (the promise, under 8 words),
  `payoff` (optional array of words for a payoff beat).
- `audience`: who watches and what they already know. `personas`: 4 to 8 specific viewer types
  with an `id` and a one-line `desc`. These are the `persona` axis values.
- `voice`: `tone`, `do`, `dont`, `banned`.
- `features`: 5 to 12 entries `{ id, name, proof, icon, ui }`. These are the `feature` axis values.
  More features means more room to vary.
- `proof_points`: facts safe to state on screen. `disclaimers`: lines for the post caption when
  data is illustrative.
- `cta`: `url`, `primary` (button text), `fineprint`.
- `tokens`: `bg panel panel2 ink muted line accent brand brandInk positive warning negative`.
  `accent` draws the world lines; `brand` fills primary buttons and painted areas.
- `fonts`: `display` and `body` families with weights and fallbacks, `css` URL, optional `files`.
- `type`: `displayWeight`, `displayTracking`, `displayCase` (`uppercase` or `none`), `radius`.
- `logo`: `file`, `width`, `height` (pixels), optional `floorWidth` (world units when laid on the
  floor at the end). `icon`: app icon file.
- `world`: `preset` (`dataGrid` or `targetRings`),
  `options`, and `motif` (a sentence describing the domain as line art, for custom worlds).

## Choosing the world

The world is the page's visual signature, so pick something that says the app's domain at a
glance: a grid floor for data and productivity tools, a route map for
travel or delivery, target rings for goals and fitness, a blueprint for developer tools. When no
preset fits, describe the motif and build it per video from `shapes` in `lib/world3d.mjs`. Light
brands work too: the template switches the world to multiply blending automatically.

## Personas and features drive variation

The `feature` and `persona` axes come straight from this file. A profile with three features and
one persona will exhaust its variety within a few videos, and `suggest` will start failing. When
that happens, add real features and personas rather than loosening the rules.
