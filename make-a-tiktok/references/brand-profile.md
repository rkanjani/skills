# Brand profile

`brand/brand.json` is the single source of the app's look, voice, features, and sound for every
video in a studio. It is also where personalization comes from: two apps whose profiles hold only
colors and fonts will get the same video in two palettes. Build it once per app with care; every
later run inherits it. Start from `assets/brand.template.json` (copied by `studio init`).

`studio profile` lists what a profile still lacks and how to close each gap, and `studio status`
prints the same list as DO NOW. Closing it is the run's work, done from the app and its
repository without asking the user; `studio suggest` and `studio check` wait for it.

## Contents

- Where to look in a repository
- From a website only
- Real screens
- Identity: what only this app has
- The app's own catalog
- Sonic identity
- References and the style guide
- Field guide
- Choosing the world
- Personas and features drive variation

## Where to look in a repository

Read, do not guess. Record every file you used in `sources`, and list what you found (assets,
screens, fonts, colors) before animating anything.

- Colors: CSS custom properties (`:root`, `.dark`), Tailwind theme (`tailwind.config.*`,
  `@theme` blocks), design token files, marketing or landing page styles (often the most
  expressive palette). Map them to the token roles below; prefer the dark palette for motion.
- Fonts: `index.html` or layout `<link>` tags to Google Fonts, `@font-face` rules, `next/font`
  calls. Copy the Google Fonts CSS URL into `fonts.css`, or copy local font files into
  `brand/assets/fonts/` and list them in `fonts.files`. One display face and one body face.
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
- Imagery: photos, illustrations, generated artwork, and sample data the app ships with. Real
  images from the product are the fastest way to make a video belong to it.

## From a website only

Use a browser tool to read the site's text and computed styles (colors, fonts), and `studio
capture` for its screens. Downloading logo files needs the user's permission; ask for the assets
or for the repository when you do not have them. Never invent a logo.

## Real screens

Never redraw the product UI from imagination. Capture the real thing and animate it: crop, pan,
push in, annotate, drive it with a cursor.

```bash
studio capture --url https://app.example.com/lists --name lists          # phone viewport, 3x
studio capture --url http://localhost:3000/plan --name plan --wait 800   # a local dev server
studio capture --url https://example.com --name home --desktop --full    # full desktop page
studio capture --url https://app.example.com/lists --name row --selector "[data-row='1']"
```

Each capture is saved to `brand/assets/screens/` and registered in `brand.surfaces`:

```json
"surfaces": [
  { "id": "lists", "file": "assets/screens/lists.png", "what": "Sunday plan with three lists, one half done", "viewport": "390x844@3x" }
]
```

View every capture and rewrite its `what` to describe the screen and the state it shows. Capture
states, not just pages: empty, mid-task, done. Work down this list until something yields screens,
without stopping to ask:

1. The brand's public site and any public product pages (`brand.url`).
2. A local dev server, when the repository starts one with a single command and it needs no
   secrets; use seeded or demo data.
3. Screenshots already in the repository: README images, store listings, docs, visual test
   snapshots, a Storybook. Copy them into `brand/assets/screens/` and list them in `surfaces`.
4. For a native app with a simulator already booted, a simulator screenshot.

If none of these works (everything is behind a sign-in, or the app is native with nothing
checked in), set `"surfaces_unavailable": "<why>"` in `brand.json`, mirror the real components
faithfully from the source, and say so in the report. Do not hold the run for it.
When a mock is needed (to animate a state change the screenshot cannot show), copy the structure
and wording of the app's real components and keep the screenshot next to it as the reference.

Scenes load a surface with `ctx.asset(surface.file)` in a real `<img>` node (the renderer waits
for images to decode).

## Identity: what only this app has

```json
"identity": {
  "only_here": ["A still-life painting made from three people's answers", "Answers pinned to their spot in the painting"],
  "moments": ["The end of a game night", "A long car ride with nothing to say"],
  "motifs": ["Paper tags", "Thin ink rules", "A gallery shelf"],
  "objects": ["Question cards", "The framed painting"],
  "anti": ["Neon glows", "Sports-broadcast energy", "Dashboards"]
}
```

- `only_here`: what a viewer can see in this product and nowhere else. Every logline should use
  one. If the list is empty, the videos will be generic.
- `moments`: when a real person reaches for the app. These are where stories start.
- `motifs` and `objects`: the visual nouns of the product and its domain.
- `anti`: looks and moods that would be wrong for this brand, however good they look elsewhere.

## The app's own catalog

The shared catalog (`assets/axes.json`) is the same for every app. A brand adds values of its own
and removes the ones that do not suit it, so `suggest` draws from a pool no other app has:

```json
"axes": {
  "add": {
    "world": [
      { "id": "gallery-shelf", "how": "A plaster wall and a shelf: framed paintings, paper tags, soft daylight." },
      { "id": "question-deck", "how": "Cards dealt onto a table from above, fanning and stacking." }
    ],
    "format": [
      { "id": "find-the-answer", "how": "A finished painting first; the viewer hunts for the answers hidden in it.",
        "beats": [{ "id": "painting", "share": 0.25 }, { "id": "hunt", "share": 0.3 }, { "id": "reveal", "share": 0.3 }, { "id": "close", "share": 0.15 }] }
    ],
    "opening": [{ "id": "painting-closeup", "how": "A detail of a real painting fills the frame." }]
  },
  "remove": { "register": ["rivalrous", "hype"], "world": ["domain-world", "data-floor"], "camera": ["whip-pans"] }
}
```

Aim for three to six looks (`world`) and two to four formats that come from the product, plus an
opening or two. A format needs `beats` (story steps with shares that sum to 1). Remove what the
`identity.anti` list rules out. `studio.json` takes the same `axes` block for page-level choices.
`studio axes` marks app values with `(app)`.

## Sonic identity

```json
"sound": {
  "motif": { "degrees": [5, 8, 6, 5], "steps": [0, 2, 4, 6] },
  "families": ["dusty", "piano", "mallet", "glass"],
  "avoid": ["sub808", "breaks"],
  "domain": "A paper card flick; a soft shutter when a painting is saved."
}
```

- `motif`: the app's sonic logo as scale degrees (1 is the tonic, 8 the octave) and a rhythm in
  sixteenth steps. Three or four notes. It plays in every video's key and lead voice, so it is the
  one sound that repeats. Without it, a stable motif is derived from the app's name; `studio
  status` prints it so you can adopt or replace it.
- `families`: instrument families that suit the brand (see `references/sound-design.md`). When
  set, the `music` axis only offers values from these families.
- `avoid`: families that are wrong for it; their music values leave this app's catalog.
- `domain`: sounds from the app's world worth building as voices.

## References and the style guide

A reference gives a video pacing, type, and transitions to learn from. Keep them in
`brand/refs/`:

```bash
studio refs path/to/launch-film.mp4 --name launch     # contact sheet + shot lengths
studio refs path/to/frame.png --name wall-label        # a single frame
studio refs                                            # what is there
```

For a video it writes a contact sheet and measures the cuts: how many shots, and their median,
shortest, and longest length. View the sheet, then write `brand/style_guide.md` once per app:
palette (hex), type (family, weight, tracking), shot lengths, transition types, camera moves,
texture and grain, and how text enters and leaves. Good sources: the app's own marketing and
launch videos, its site, its packaging or printed matter, and work the user points to. Take the
grammar of a reference, never its content, logos, or characters. Each video then names one look
from this material (`meta.json` `look`).

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
  `accent` draws the world lines; `brand` fills primary buttons and painted areas. One accent
  unless the brand truly has more.
- `fonts`: `display` and `body` families with weights and fallbacks, `css` URL, optional `files`.
- `type`: `displayWeight`, `displayTracking`, `displayCase` (`uppercase` or `none`), `radius`.
- `logo`: `file`, `width`, `height` (pixels), optional `floorWidth` (world units when laid on the
  floor at the end). `icon`: app icon file.
- `surfaces`: real screens, added by `studio capture`.
- `identity`: `only_here`, `moments`, `motifs`, `objects`, `anti`.
- `axes`: `add` and `remove`, per axis.
- `sound`: `motif`, `families`, `avoid`, `domain`.
- `world`: `preset` (`basketballCourt`, `soccerPitch`, `runningTrack`, `dataGrid`, `targetRings`,
  or null), `options`, and `motif` (a sentence describing the domain as line art, for custom
  worlds).

## Choosing the world

The world is one of the page's visual signatures, so pick something that says the app's domain at
a glance: a court or pitch for sports, a route map for travel or delivery, target rings for goals
and fitness, a blueprint for developer tools. The 3D line-art world is one option, not the house
style: a light editorial brand may want paper and real images, and a product with a strong UI may
want its real screens as the stage. When no preset fits, describe the motif and build it per video
from `shapes` in `lib/world3d.mjs`, or build the look as its own world block. Record the app's
looks under `axes.add.world` so they rotate.

## Personas and features drive variation

The `feature` and `persona` axes come straight from this file. A profile with three features and
one persona will exhaust its variety within a few videos, and `suggest` will start failing. When
that happens, add real features, personas, and app-specific looks and formats rather than
loosening the rules.
