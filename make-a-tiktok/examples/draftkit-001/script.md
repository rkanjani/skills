# #001 Down 4-5 comeback

App: DraftKit · Created: 2026-09-26 · Source: `source/` (built before the skill; uses an earlier
single-file engine, so read it for technique, not structure)

## Concept

A grinder is down 4-5 in a category matchup with two nights left, asks DraftKit AI who to stream,
watches it read the league and filter 214 free agents to one pick, adds him, and the matchup
flips to 6-3; then a short tour of stream, sit, and trade, and a climb to first place.

## Why this one is different

First video on the page. It sets the brand's motion language: a full NBA court in gold line art
as a continuous world, brand purple for AI and actions, green only for wins.

## Audience and persona

Competitive yearly Yahoo managers (persona: grinder). Feeling at the end: "I would have won that
week."

## Hook (first second)

- Hook line: "DOWN 4-5." over "LIVE · 2 NIGHTS LEFT".
- Why it stops the scroll: every category-league player knows that exact score and that exact
  Sunday-night dread.

## Scenes and pace

128 BPM, 21 bars, 39.375 s. b(n) = n x 0.46875 s. Re-cut from the first 15 s version (one bar per
act), which read too fast: each act now gets the bars its copy needs (1.5 s plus 0.3 s per word),
transitions take 0.4 to 0.8 s, and the drop and the montage whips are the only fast moments.

| Scene | Time (s) | Bars | The one idea | On-screen copy | Picture | Sound |
| --- | --- | --- | --- | --- | --- | --- |
| hook | 0.00 to 3.75 | 1-2 | You are losing this week | LIVE · 2 NIGHTS LEFT / DOWN / 4-5 / 9 category tiles, AST -5 and STL -2 | Lines draw out from center court; DOWN rises; 4-5 slams on beat 1; tiles flip up in reading order; AST and STL glow amber; everything clears and the record flies into a HUD chip | Boom + crash on frame 0, dribbles on each beat, arena air, kick + snare on the slam, tile ticks, a low two-note warning, whoosh out |
| ask | 3.75 to 7.50 | 3-4 | You ask DraftKit AI | Who do I stream this week? | The chat card rises (empty state with suggestions); the question types at a readable pace; send; the bubble lifts; the thinking row appears | Typing ticks, send click + whoosh, soft rising arpeggio |
| scan | 7.50 to 15.00 | 5-8 | It reads your league and narrows the pool | Reading your league / 214 Free agents / 38 3+ games left / 3 AST + STL fits / 1 Best stream | Camera cranes top-down; 214 dots pop in; tool chips check off; one scan ring per bar filters the dots; three finalists labeled; the pick sinks into the rim | A sonar bell per pass, counter ticks, net swish |
| answer | 15.00 to 20.63 | 9-11 | The answer and why | Tre Jones / +2.8 AST / +1.1 STL / Three games left. More AST and STL. | The pick card opens from the dot; the AI line streams; Add turns green; the camera pushes in and the card is pulled away before the drop | Card whoosh + low boom, stream ticks, add click + bells, riser, snare roll, reverse swell, near-silence gap |
| flip | 20.63 to 26.25 | 12-14 | One add flipped the matchup | +9 AST / +3 STL / UP / 6-3 / ONE ADD · MATCHUP FLIPPED | DROP: the scoreboard smashes back; AST then STL flip green; the record rolls 4-5, 5-4, 6-3; DOWN rolls to UP; holds for 3 s | Big boom, crash, crowd swell, flip clacks and bells, stab on UP |
| montage | 26.25 to 30.00 | 15-16 | It does more than streams | STREAM. / SIT. / TRADE. / JUST ASK. | One word per beat pair with a mini UI card; the court whips 90 degrees per word (0.45 s whips) | Four-on-the-floor, stab + whoosh per word |
| climb | 30.00 to 33.75 | 17-18 | Win your league | Win your week. / league. | WIN YOUR WEEK. lands; Stream Team climbs 7th to 1st; WEEK rolls to LEAGUE in gold; trophy | Rising blips per rank, bell run at first place |
| endcard | 33.75 to 39.38 | 19-21 | DraftKit, for Yahoo | FOR YAHOO FANTASY BASKETBALL / DraftKit / AI that knows your league. / draftkit.ai | The real logo drops onto center court with a shockwave; the camera settles top-down; the line, then the CTA with a shine every 2.4 s | Boom, buzzer, crowd, F major chord and a soft pad, bells, light hats, fade |

## Camera and world

One continuous camera over a full court: low angle, crane to top-down for the scan, dive to the
rim, whip to the far side for the drop, 90 degree whip orbit per montage word, crane up during the
climb, top-down full court at the end. The camera travels between acts and nearly holds while
copy is on screen. Signature moves: record into HUD chip, dot to card
circular reveal, split-flap tile flips, logo onto center court.

## Sound

Trap at 128 BPM in F minor (Fm Fm Db Eb loops through the build, F major on the logo). A filtered
build for eleven bars under the ask, scan, and answer, the drop at 20.6 s as the matchup turns,
four-on-the-floor for the montage, buzzer on the logo, a soft pad and light hats under the end
card.

## Ending and CTA

End card: logo, "AI that knows your league.", draftkit.ai button, "For Yahoo Fantasy Basketball".

## Claims check

- Waiver ranking by games left and category need: matches the product's waiver stream feature.
- Player names and stats (Tre Jones +2.8 AST, Fit 92, 214 free agents) are illustrative example
  data, the same convention as the landing page demo.
- "One add. Matchup flipped." is presented as an example week, not a guaranteed outcome.

## Decisions

- Real NBA player names as example data, matching the landing page, with the disclaimer in the
  caption.
- Synthesized soundtrack; an SFX-only export for trending sounds.
- Re-cut to 39.4 s for comprehension (user feedback: the 15 s cut was too fast to follow). Cut
  the league chat notification and trimmed the question, the AI line, and the hook eyebrow so
  each scene carries one idea.
