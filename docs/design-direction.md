# Design Direction: Pentaradial Intelligence

> This document expands the canonical
> [style essence](style-essence.md) into visual-system rules. When making a new
> aesthetic decision, preserve the essence first and use this document for
> implementation detail.

## Intent

The product should feel like a precise instrument built by a highly capable,
non-human engineer: calm, mathematically ordered, tactile, and immediately
legible.

The high-level science-fiction reference is pentaradial engineering and musical
communication associated with Rocky in *Project Hail Mary*. The product must not
copy a character, ship, film asset, logo, or proprietary production design.

## Visual grammar

- Use fivefold radial balance as the underlying composition.
- Favor a coherent family of angular hexagons, diamonds, pentagons, prisms,
  kites, beveled blocks, peaks, and simple shields.
- Use subtle center-out radial connections to make the field read as one
  engineered system rather than an arbitrary web.
- A very slow line signal or opacity drift may provide ambient visual interest.
- On the home screen, pair one partial gold orbital segment with a thinner
  steel-blue segment on a smaller concentric orbit. The smaller segment travels
  in the opposite direction; neither segment closes into a full circle.
- Use a narrow range of translucent mineral-blue surfaces. Pulse Path targets
  are asymmetric blueprint assemblies with solid, dashed, and dotted traces at
  different weights. Line overlap creates depth; never use three-part faceted
  gem shading. Active gold remains the only strong color signal.
- Build the EdgeCircuit mark from the same blueprint grammar at a denser scale:
  one asymmetric body, one offset dashed contour, one structural brace, one
  dotted guide, and a single gold index point. Do not use folded gemstone
  facets or make the mark identical to a playable target.
- Avoid irregular blobs, decorative stars, puzzle-piece silhouettes, or shapes
  with needless notches.
- Avoid soft capsules, circles, and generic rounded squares in the training
  field; they weaken the faceted engineering motif.
- Keep shapes solid, with no numbers, icons, holes, or internal marks.
- Prefer engineered asymmetric frames derived from diamonds, octagons, prisms,
  trapezoids, pentagons, and shields. Distinction comes from silhouette,
  proportion, displaced contours, and construction-line routing rather than
  internal tonal shading.
- Use faint construction geometry only as a background layer.
- Let negative space do most of the work.

On the home screen, the playable `BlueprintShape`-derived game nodes are the
only large orbital bodies. Retain sparse white signal points, deliberately
routed low-opacity circuit scaffolding, partial orbital segments, and mixed
line weights behind the navigation. The scaffolding may include nested traces,
radial branches, small junctions, calibration ticks, and short offset
fragments, but it must never become a dense HUD or random decorative web. Do
not show speculative **TBD** stations or empty game placeholders. The game
nodes use clipped corners and offset technical frames while their content
remains flat and highly legible.

The home also includes quiet surrounding constellation space for implemented
games the player has removed from the Daily Circuit. Off-circuit cards retain
their full game identity, launch action, task-history badge, and exact local
placement, but always use the inactive blue-gray shell rather than the circuit's
green daily-completion treatment. They are visibly separate from the active
route.

## Constellation behavior

- A field contains nine distinct silhouettes selected from a twelve-shape
  library.
- One seeded field remains stable for one complete watch-and-recall round.
- Every next round changes the silhouette selection, shape-to-slot mapping, and
  layout variant. The remap happens only after feedback, never while the user
  is studying or rebuilding the current path.
- Layouts use pentaradial balance rather than a rectangular grid.
- Invisible touch targets remain substantially larger than the visible shapes.

## Home cognitive map

- Draw the Daily Circuit as a sharp, deliberately beveled asymmetric polygon
  rather than a circle or standard ellipse.
- Make the central Daily Circuit hub a compact black-hole nucleus. Preserve its
  black event-horizon ring and surround it with fine broken blue-white sketch
  traces at slightly different angles, offsets, weights, and dash rhythms.
  Retain one stationary brass anchor circle around the black event horizon.
  Give it restrained polished depth with a bright upper edge, darker lower
  edge, and faint warm reflection. Place a finer steel-white event-horizon rim
  just inside it. Both solid rings remain fixed. Use three tightly nested
  exterior traces in bright white, soft white, and steel-white; rotate them in
  mixed directions at roughly 14, 18, and 23 seconds per revolution. Nothing rotates or draws
  across the black interior. These lines suggest gravitational light fuzz, not brass orbital
  hardware, steampunk machinery, or a dense atomic model. Never turn this
  nucleus green; green belongs to
  completed games, correct feedback, and strong task results.
- Build the wider route from nested angular perimeter traces, radial spokes,
  small junctions, and overlapping solid, dashed, and dotted construction lines.
  Added circuit detail should clarify the engineered hierarchy, not fill every
  empty area. On desktop, keep the route near 730 by 520 CSS pixels so it reads
  as one contained instrument rather than filling the entire page.
- Place two or three imperfect broken light traces immediately around the
  central hub at visibly different angles. Let them drift or counter-rotate
  almost imperceptibly; avoid polished complete ellipses.
- Treat the seven implemented exercises—Pulse Path, Digit Hold, Rule Shift,
  Signal Sweep, Vector Match, Trace Pair, and Name Recall—as the available game library. Place the
  user's selected subset as medium Pulse-style blueprint nodes traveling around
  the route at even separation.
- Place implemented games outside that subset in quiet constellation space
  around the route, never in a bottom tray. Off-circuit games remain immediately
  launchable but remain blue-gray regardless of prior task history. A session
  completed while the game is off circuit remains blue while floating, but its
  qualifying daily completion resolves to green when it is on the route.
- Give those off-circuit cards small independent zero-gravity drifts rather
  than a synchronized bob: three to six pixels on softly elliptical paths,
  under half a degree of rotation, with varied phases and nine-to-eleven-second
  durations. Move only the visible inner shell so the card's saved position,
  hit target, and connector anchor do not wander. Pause motion for hover,
  keyboard focus, and drag.
- Allow a playable card to move between the route and surrounding field by
  pointer drag. The entire shell has a generous invisible grab margin and a
  three-pixel movement threshold. Dropping onto the broad route band sets its
  orbital phase; the accepted band spans the nested route traces so placement
  never requires contact with a one-pixel stroke. The dragged node keeps the
  requested phase. Resolve a potential collision by shifting neighboring nodes
  only far enough to maintain a clear minimum separation while preserving
  circular order. Dropping elsewhere preserves its free position. Pause orbital
  translation throughout the drag. Carry a full-resolution copy of the complete
  node under the pointer at its original grab offset, leave the source only
  faintly visible, and reveal restrained, unambiguous drop-target states only
  while they are needed. Never add a connector line, instruction banner,
  generic browser drag image, or separate cursor badge.
- Give every playable card a keyboard-accessible **Add to circuit** or **Move
  to reserve** control that mirrors drag-and-drop. Preserve Enter/Space launch
  behavior on the game action itself, announce the new location, and maintain a
  visible focus indicator.
- Persist circuit membership locally as a durable preference across refreshes
  and local calendar days. Store it separately from daily completions and
  completed-session history; reconfiguring the circuit never erases either.
- Calculate the central hub count from included circuit games only:
  `included games cleared today / included games`. A game clears only after
  the player completes all three rounds of an on-circuit session at 70%
  accuracy or better. A below-threshold session still increments the play
  count and updates mean task success, but it does not green the node or
  increase the hub count; a later qualifying replay may clear it. If the
  selected set is empty, label the hub **Standby** and never resolve `0/0` as
  **Complete**.
- Keep the node shells slightly restrained. Give each game a bespoke,
  immediately recognizable vector illustration occupying roughly one-third of
  the node's usable width and built from the shared solid, dashed, dotted, and
  indexed blueprint line grammar. Never substitute tiny generic primitive
  marks or Unicode symbols.
- Place one readable circular completed-session counter directly below the game
  name. Do not hang it from the node edge. Show the completed-session number
  in larger white type; unplayed games show `0`. Put mean completed-session
  task success on the line below, using `—% success` until data exists. Keep
  the copy column visually centered on the asymmetric polygon rather than the
  rectangular bounds; on desktop this means a clear leftward registration.
  Make the title its dominant line and reserve enough width for the full game
  name and word `success`. Both the play number and `play`/`plays`
  label remain pure white when the shell turns green. Preserve the readouts on
  dragged and off-circuit nodes, and never present them as intelligence,
  readiness, or cross-game ability.
  Position the play-count row independently to the right of the illustration;
  its circle and label must neither cover the bespoke glyph nor leave the
  polygon boundary.
- Nodes translate clockwise around the route without rotating. Titles stay
  horizontal, and hovering or keyboard-focusing any node pauses the orbit for
  selection. One complete route takes approximately 116 seconds. The main route
  signals and construction-plane flow move counterclockwise so the circuit
  machinery visibly counters the playable-node direction. Add up to three tiny
  gold, steel, or white signal points moving directly on the perimeter at
  distinct restrained speeds; they clarify the route rather than decorate it.
- Keep the event horizon fixed while its thin sketch traces counter-rotate
  almost imperceptibly. Avoid visible mechanical orbit hardware.
- A completed node changes from mineral blue to an unmistakably full muted-green
  polygon field with restrained gold and pale-green construction traces for the
  rest of the local day. Do not leave most of a qualifying card blue. Only its
  blueprint shell makes one controlled turn; its icon and title remain upright.
- In light mode, render game-node containers with transparent backgrounds and
  no rectangular shadow plate; only the clipped blueprint shell is visible.
- Keep the page grid just visible in both themes with true contrast against the
  field: light steel over dark navy and slate over the light paper surface.
- Keep the play and success metrics inside every game shell below its title.
  Both values use matching larger pure-white metric type; their labels remain
  compact. Use `0 plays` and `—% success` until the first completed session.
  Persist them locally across days and never include abandoned sessions.
- Do not render future-capacity placeholders. A game appears only when it is
  implemented and launchable.
- Do not place a marketing heading above the orbit. The hub reads **“Daily
  circuit”** with the completed count. Each game title stays on one horizontal
  line, with its second word—**Path**, **Hold**, **Shift**, **Sweep**,
  **Match**, **Pair**, or **Recall**—in restrained gold. Never revert to equal-height dashboard cards,
  a dense tile grid, or
  “Choose your focus.”

## Additional training mechanics

- **Signal Sweep** runs for three rounds. Its setup offers four, six, eight,
  or ten candidate signals and defaults to six. Each round shows one blueprint
  cue and the selected number of candidates. Exactly one candidate matches the
  cue's contour, orientation, and index mark; controlled near-matches differ on
  one or more of those dimensions. One selection resolves the round.
- **Vector Match** runs for three rounds. Each round shows an asymmetric
  blueprint figure beside a transformed comparison. The player classifies the
  comparison as the same figure under rotation or as a mirror reflection.
  Displaced contours, construction lines, and index marks make the distinction
  legible without turning the task into decorative shape matching.
- **Trace Pair** runs for three rounds. Each round presents six free blueprint
  assemblies around a loose circular constellation, joined by quiet radial
  spokes to one central junction. Exactly one pair has the same internal
  connection topology. A correct pair lights its two spokes in muted green
  with restrained gold detail. Shell, datum position, and rotation vary
  independently. Selection is direct; never turn it into a face-down card grid
  or duplicate-image hunt. Give each
  visible assembly a small independent zero-gravity drift while the surrounding
  button remains stationary; vary phase, axis, duration, and sub-degree rotation
  so motion never changes the answer geometry or weakens target acquisition.
- **Name Recall** runs for three rounds. Each round shows three unique,
  recognizably human professional portraits paired with first names for 4.5 seconds, clears them for
  a 650-millisecond retention beat, then returns one identity with the same
  three names as choices. Use the exact same three face-to-name contacts
  throughout one complete three-round iteration. Change only the recalled
  target and answer order between rounds; each person becomes the target once.
  Pair names from the matching masculine or feminine pool for each portrait;
  never shuffle names and faces independently.
  Use consistent crop, lighting, and background across a diverse adult cast;
  do not replace faces with abstract geometric signatures. Measure only
  association accuracy and response pace.
- Results for these exercises remain task-specific. Accuracy and response pace
  may contribute to Practice Charge, but no exercise may be described as a
  measure of general attention, spatial intelligence, reasoning, workplace
  readiness, or cognitive health.

## Color

- Background: near-black navy.
- Primary silhouettes: muted mineral blue-gray.
- Active signal: restrained deep gold.
- Correct resolution: muted mineral green.
- Secondary lines: desaturated steel blue at low opacity.
- Never use a rainbow palette to distinguish targets; silhouette and position
  carry identity.

## Motion

- Active targets expand once with a short, controlled pulse.
- After an exact Pulse Path recall, briefly resolve only the successful
  targets' center-out radial tethers in muted green with a restrained traveling
  dash. Leave every tether quiet after an incorrect recall.
- Leave 1.45 seconds between the start of a Pulse Path round and its first
  activation so the user can orient to the field. Do not add the extra delay
  between later shapes.
- A faint network signal and one-to-two-pixel marker drift may move slowly in
  the background. Pulse Path forms also use clearly visible, smooth tethered
  drift around fixed radial anchors.
- No wobble, bounce, particle effects, node spin, or neon glow. Pulse Path's
  tethered forms may rotate by roughly one degree as part of their zero-gravity
  drift. Home game nodes may translate around the circuit while remaining
  upright on an approximately 116-second route; the hub's two small incomplete
  orbits and the larger construction planes may counter-rotate slowly around
  the fixed center.
- During circuit customization, pause node translation and use a restrained
  gold or steel-blue edge treatment for the active drop destination. Movement
  between route and reserve should settle directly without bounce or particle
  celebration. The complete moving node remains visible throughout the gesture
  and disappears only after the drop resolves.
- Feedback should feel conclusive: one quiet confirmation, then advance.
- Hover may emphasize or pause a home game node, but it must never reflow,
  translate, rotate, or otherwise offset that node's text cluster relative to
  its blueprint shell.
- Beneath each game title, show a larger white play count with its `play` or
  `plays` label. Replace `Complete today` and `3 rounds` with the game's mean
  completed-session success percentage on the next line in the same pure-white
  metric style. Use `—% success` when no session exists; a tiny green datum may
  mark a strong task score without recoloring the number.
- Show a compact five-second falling-hourglass pace window during untimed
  choice phases. It awards pace credit for a correct response inside the
  window but never auto-submits, fails, or ends the round when time expires.
- Correct feedback uses one faceted green check plate with two incomplete
  orbital segments: a brighter outer arc and a thinner steel-green inner arc
  counter-rotate briefly. Never draw a complete circular success ring.

## Sound

- Pulse Path uses five related, quiet pitches during presentation so sound
  reinforces sequence order without replacing the visual task.
- Each Pulse Path target owns a presentation pitch. Selecting that target
  during recall replays the identical pitch and timbre, so a correct visual
  path recreates the demonstrated sound sequence.
- Correct completion uses a restrained three-note chord; an imperfect round
  uses a softer two-note acknowledgement rather than a failure buzzer.
- Digit Hold uses one quiet two-note reveal cue when each number appears, then
  the same restrained correct/imperfect feedback language after recall.
- Rule Shift gives the directional signal one restrained cue and shares the
  established correct/imperfect feedback language.
- Never use background music, alarms, speech, coin sounds, or arcade effects.
- Sound cues are optional, saved as a preference, and never required to play.

## Typography and layout

- Editorial serif for major moments and summaries.
- Compact sans serif for controls, metrics, and instruction.
- Monospace only for recalled digit strings.
- Short copy, decisive labels, and one primary action per screen.

## UX standard

The header's Practice Charge appears as a small beveled five-segment battery
with a numeric `/100` readout. Gold fill communicates accumulation; a full
battery may resolve to muted green. A quiet rep count may appear under the
readout on wider screens. Keep the complete battery module and the joined theme
and sound controls approximately one quarter smaller than the original
instrument row. The algorithm assigns 45 points to circuit coverage, 25 to
rounds completed against three planned rounds per selected game, 20 to task
accuracy, and 10 to accuracy-gated response pace. Phase the two performance
components in across six measured rounds and hold an empty circuit at zero. It
never implies general ability, resets daily, and stays visually subordinate to
the screen's primary action.

Lock four compact diagnostics to the cardinal points of the broken gold orbit
around the Daily Circuit hub. Use one short label and one measured value per
readout: **Accuracy**, **Pace**, **Recall**, and **Rounds**. They are flat
instrument annotations with a fine gold index, not badges, game polygons, or
wide dashboard cards. Keep their boxes near 56 CSS pixels wide, allowing Pace
about 62 pixels for its unit, so the central circuit retains clear negative
space. Keep the full cluster tight enough
to read as one nucleus and clear of every playable node.
Allow the fixed desktop hub to grow to roughly 126 CSS pixels so its initiation
action fits without compression. Show only `Initiate / Circuit` in the hub;
omit the `Daily circuit` eyebrow, badge tally, and completed/total fraction.
Use that fixed hub as the sole **Initiate Circuit** button. Replace the
completed/total fraction with the launch label; the completed nodes themselves
carry progress. Activation queues every selected circuit game in saved order,
uses each exercise's current default setup, preserves normal three-round
feedback, and advances directly to the next game. Exit to home cancels the
remaining queue.

Accuracy is mean task accuracy across today's completed rounds. Pace is mean
response time per expected item and should display in milliseconds or seconds
per item. Recall is mean task accuracy across Pulse Path and Digit Hold only.
Rounds is today's completed-round count. Use an em dash until a measure has
observations. Never relabel these as attention, intelligence, readiness, brain
age, or health. Preserve the existing daily achievement thresholds, but reduce
their home-screen presence to one quiet earned-badge tally inside the hub. An
earned badge remains earned for the rest of that local day even if later
accuracy lowers the running average.

Every screen should answer three questions without explanation:

1. What should I attend to?
2. What action is available now?
3. What will happen next?

If a decorative choice makes any answer less obvious, remove it.

During any exercise, the left side of the session bar uses one
**Exit to home** control. It discards the unfinished run without a confirmation
step and without creating a resumable checkpoint. Do not expose save, pause, or
resume controls for active games.

On home, launching and arranging are separate but equally available actions.
A pointer drag changes circuit membership; a normal activation launches the
game. Keyboard users receive the same add/remove outcome through an explicit
card control, without needing to emulate pointer movement. The surrounding
off-circuit field remains quiet at rest but never appears disabled.

These home-screen rules govern both desktop and responsive mobile web. On a
phone, use a dedicated compact orbital path rather than squeezing the desktop
coordinates into the viewport. Keep all seven game nodes legible, preserve the
central launch instrument, expose at least 38 CSS-pixel preference controls and
generous card hit areas, and make the card-level add/remove control permanently
visible. Native `apps/mobile/` work remains parked until explicitly reactivated.
