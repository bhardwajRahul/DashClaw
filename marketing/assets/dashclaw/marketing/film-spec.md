# DashClaw story film spec (DashClawFilm)

Authored 2026-09-03 from direction.md (NIGHT SHIFT). Every shot agent builds against
THIS file. 40 s, 1200 frames at 30 fps, 1920x1080. Two grounds: the Unreal data hall
(feeders/unreal/scenes/dashclaw_hall.py, PNG plates staged to studio/public/dashclaw/
hall/<shot>/frame_%04d.png) and rebuilt DashClaw UI in Remotion. FilmGrade once in
Film.tsx.

## Non-negotiables (brands/dashclaw.json voice)

- Dark only. Ground #0e1014, surfaces #15171c / #1d2026, lines #272b32, ink #fafafa,
  ink2 #c2c2cc, ink3 #9b9ba8.
- Orange #f97316 is a SIGNAL: the agent light, the HELD chip, the focused Allow button,
  attention. Never a wash, never a glow field, never ambient. CTA text is #fb923c.
- Green #22c55e only as the product's own verified/finished state (one tick in the
  ledger). Red #ef4444 only inside the rebuilt UI as the risk figure's high band.
- Verbs on screen: intercept, hold, enforce, record, verify. No exclamation marks.
- Type: JetBrains Mono 500 tabular for everything except the end wordmark (brand
  display font via loadBrandFonts). No captions strip, no FloatBar, no kicker.
- Plates are PNG sequences from the Unreal feeder, staged like Blender output (Img
  per frame, never a video element). The freeze is the plate holding one frame; the UI
  never freezes.

## Timeline (frames @30fps)

| # | id | from | len | ground | beat |
|---|----|------|-----|--------|------|
| 1 | hall | 0 | 150 | hall | Slow dolly down a dark aisle of racks, white slit lights, fog, floor reflections. Mono timestamp bottom-left counts 03:11:58 -> 03:12:03. Nothing else on screen. |
| 2 | agent | 150 | 180 | hall | A single orange point of light enters from behind camera and travels down the aisle ahead of us, reflected on the floor; the camera follows at a distance. Mono caption appears once, small, ink3: `agent-7 · unattended`. |
| 3 | reach | 330 | 120 | hall | The light stops at a rack whose face shows a mono glyph `deploy --prod` in ink2. The light accelerates toward it. HOLD 1 (frames 390-450): everything freezes, the fog stops, a thin orange rule draws under the glyph, the timestamp stops at 03:12:14. |
| 4 | intercept | 450 | 210 | ui | Cut on the hold to the rebuilt approvals inbox (sourceRoute /approvals): a held-action card slides in from the right and settles: header `HELD` chip (orange block, ink text), command `deploy --prod` in mono, `risk 0.82` with a red band, the bound command hash, `waiting 00:00:04` counting. Two buttons: Deny (line) and Allow (surface). Cursor bows in over Allow, the button takes the orange focus rule, click, the card's HELD chip flips to `ALLOWED` (surface, ink2) and a ledger row is born beneath it and slides down out of frame. |
| 5 | release | 660 | 150 | hall | Back on the frozen frame from shot 3; the world unfreezes: the light passes into the rack, the rack face pulses white once, the timestamp resumes. The camera rises up and back through the fog until the aisle is a line among many. |
| 6 | ledger | 810 | 150 | ui | Rebuilt ledger (sourceRoute /decisions) on the dark ground: a table of governed actions; three rows waterfall in (agent-7 deploy --prod · decision d-4f21 · verified tick #22c55e · spend and risk columns). A thin rule links the row to the decision id: the chain. Mono caption under: `chained to the decision that allowed it`. |
| 7 | wide | 960 | 240 | hall | High wide over the whole hall: dozens of orange lights move along the aisles; every few frames one freezes for a beat and releases, out of phase (HOLD 3 as rhythm). The end lockup fades in small, centre: DashClaw mark + wordmark, one line `The approval layer for unattended agents.` (ink), CTA `dashclaw.io` in #fb923c. Holds static from frame 1140. |

Every word on screen is from out/dashclaw/marketing/brief.json (hook.altHeadlines[0]
is the end line; features[0] and [1] give the inbox and ledger copy; cta gives the
url). Figures in the UI (`risk 0.82`, `d-4f21`, `00:00:04`) are illustrative product
UI values and are labelled as such in DISCLOSURE.md; the brief carries no numeric
proof points, so the film asserts none.

## Narration (planned here, ~2.6 words/s, 150 ms breath)

| shot | starts (s) | line |
|---|---|---|
| 1 | 1.0 | At three in the morning, your agent is still working. |
| 2 | 6.0 | It reads. It writes. It deploys. Nobody is watching. |
| 3 | 12.0 | Until it reaches for something that cannot be undone. |
| 4 | 15.5 | DashClaw holds it. Risk scored, bound to the exact command. Waiting for you, wherever you are. |
| 5 | 22.5 | One click. It runs. And the decision is on the record. |
| 6 | 27.5 | Every governed action, chained to the decision that allowed it. Not a log after the fact. |
| 7 | 33.0 | Govern your agents at dashclaw dot io. |

85 words (copy council revision 2026-09-06: category line on the end card, remote cue on shot 4, the alternative named on shot 6). SFX cues: the hold (frame 390: every sound but room tone stops), the click
(frame 600), the release (frame 675: fans return), each freeze in shot 7 (soft ticks).

## Unreal plates (feeders/unreal/scenes/dashclaw_hall.py)

One scene script, `--shot hall|agent|reach|release|wide`, each shot its own MRQ job
in ONE launch (a launch costs 45 s of boot; batch). Primitives only: racks are
1.0 x 0.6 x 2.2 m cubes in the surface material, slit lights are thin emissive
white cubes on each rack face, the floor is a reflective dark plane, fog is
ExponentialHeightFog, the agent is a small emissive orange sphere with a point
light, keyed along the aisle. Camera: CineCameraActor, 24 mm, f/2.8. 1920x1080,
30 fps, PNG. Motion blur on. The freeze is flat keys, not a paused render.

## Render + proof

- Plates: `python feeders/unreal/render.py feeders/unreal/scenes/dashclaw_hall.py
  --out out/dashclaw/hall --animation --timeout 900` then
  `node scripts/stage-blender-assets.mjs dashclaw` (it stages any sequence dir).
- Shots and the director loop exactly as postflop's spec: still, half-scale range,
  contact sheet, Read, fix, next version. Judges: judge-motion, judge-palette (orange
  is a signal, so a wash fails), check-audio hard.
