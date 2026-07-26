# Product and Architecture Decisions

This is the lightweight decision log for choices that affect more than one
workspace. Revisit a decision when product evidence changes, not simply because
another library is available.

## ADR-001: Pulse Path is the first training loop

**Status:** Accepted — July 25, 2026

The first vertical slice is **Pulse Path**, a 3×3 spatial-sequence recall task
for adults who want a calm, repeatable two-to-four-minute daily challenge.
Each session contains three rounds. The player watches a path and then repeats
it without a response deadline.

The app reports only task-level measures:

- points earned from correctly recalled positions;
- recall rate for presented positions;
- longest perfectly recalled sequence; and
- perfect rounds within the session.

These results are not measures of intelligence, general memory, or cognitive
health. The product will not use "brain age," IQ estimates, diagnostic
comparisons, or prevention/treatment claims.

Difficulty begins at sequence length three. Two perfect rounds increase the
next sequence by one; two imperfect rounds decrease it by one. Sequence length
is clamped from two through eight. Response speed does not affect task points
or difficulty. Starting with ADR-006, a broad, accuracy-gated response band
contributes a small component to the separate daily Practice Charge without
being presented as ability.

## ADR-002: Separate web and native clients share a pure TypeScript engine

**Status:** Accepted — July 25, 2026

- `apps/web`: React 19 with Vite 8 for the browser experience.
- `apps/mobile`: Expo SDK 57 with React Native 0.86 for iOS and Android.
- `packages/shared`: framework-free TypeScript for seeded rounds, scoring,
  adaptation, session state, timing, summaries, and persistence validation.
- Root npm workspaces: one lockfile and familiar commands with no task runner
  until build time demonstrates a need for one.

React Native recommends using a framework for new native apps, and Expo is the
framework selected here. Keeping the web client separate allows normal web
semantics and accessibility without coupling the gameplay experience to an
experimental server-rendering path. Shared rules prevent platform scoring
drift.

Official references:

- <https://reactnative.dev/docs/environment-setup>
- <https://docs.expo.dev/guides/monorepos/>
- <https://vite.dev/guide/>

## ADR-003: Completed-result persistence before accounts

**Status:** Accepted — July 25, 2026

Version 0 persists completed task summaries and preferences on the device:
`localStorage` on web and AsyncStorage on mobile. Active exercise state is
disposable. Choosing **Exit to home** clears the unfinished run, and reopening
or reloading the app starts from home without a save or resume path. The web
client may serialize the current deterministic session transiently while it is
open, but that state is cleared on exit or startup and is never presented as a
saved session.

No account, advertising identifier, raw tap telemetry, contacts, or health
data are collected. A future sync provider must implement a shared storage
boundary and include a migration plan before authentication is introduced.

Only completed sessions set the next session's starting level. Corrupt or
unknown local data falls back safely to an empty store.

## ADR-004: SharpMode is the working master brand

**Status:** Superseded by ADR-009 — July 25, 2026

The selected working master brand is:

> **SharpMode**  
> *Cognitive training for serious work.*

The earlier Cognivate selection was retired after current company, software,
and trademark signals surfaced. Mentavault then served as the working brand but
was less immediate and active than the owner wanted. A later shared naming
conversation favored SharpMode and rejected Sharper and SharpCore because of
adjacent exact-name uses and crowding. The preliminary SharpMode screen did not
surface an obvious exact-name brain-training, education, productivity, or
consumer-software brand, but it did surface descriptive use in an
audio-equipment manual.

**Pulse Path** remains the first exercise's name. Internal game IDs,
persistence keys, the Expo slug, mobile display metadata, and provisional store
identifiers remain unchanged until clearance and a migration plan are
complete. The web UI and metadata use SharpMode. This is a working product
choice, not professional trademark clearance. See `docs/naming-options.md` and
`docs/shared-chat-sharpmode.md`.

## ADR-005: One constellation per Pulse Path round

**Status:** Accepted — July 25, 2026

Pulse Path uses nine visually distinct silhouettes on an asymmetric field.
The shared engine derives the shape-to-position mapping and one of four layout
variants from the session seed plus the round index. The resulting
constellation remains stable through the complete watch, recall, and feedback
cycle, then deterministically remaps before the next round begins. All three
rounds therefore use distinct silhouettes, mappings, and layout variants; an
abandoned session is not restored.

This separates the cognitive rule from a permanently memorized board while
keeping each individual memory trial visually stable. The choice is
evidence-informed, not evidence that randomized visuals cause broad cognitive
transfer. See `docs/science-and-training-design.md`.

## ADR-006: Practice Charge combines reps, accuracy, and response pace

**Status:** Accepted — July 25, 2026

Practice Charge is a daily engagement and round-quality meter capped at 100.
Each completed round contributes:

- **8 repetition points** for completing the rep;
- **0–8 accuracy points** proportional to task-specific recall accuracy; and
- **0–4 pace points** from a broad response-time band normalized per recalled
  item.

The pace band awards its maximum at one second per scored item or faster and
reaches zero at five seconds per item. Pace points are multiplied by
accuracy, preventing a fast incorrect response from gaming the meter. Pulse
Path uses correct-prefix accuracy; Digit Hold uses correctly positioned
digits. Those memory games time only the recall-response phase. The four
choice exercises time stimulus-to-decision and use the nonblocking window in
ADR-017.

Practice Charge resets on the next local calendar day, persists locally, and
records the number of completed reps. It does not affect task score, adaptive
difficulty, or future content. It must never be described as intelligence,
brain power, cognitive readiness, cognitive health, or a validated
cross-exercise ability score.

## ADR-007: Three-game asymmetric Daily Circuit with capacity markers

**Status:** Accepted — July 25, 2026

The desktop web home screen presents Pulse Path, Digit Hold, and Rule Shift as
medium blueprint nodes traveling at fixed separation around one sharp,
deliberately beveled Daily Circuit route. Their game icons remain prominent and
their horizontal titles stay upright as they complete one calm orbit in
approximately 116 seconds; the second title word carries the gold accent. The
central hub and route use nested traces, radial spokes, junction points, and
mixed solid, dashed, and dotted line systems. Two small incomplete orbits
counter-rotate immediately around the hub, while larger broken construction
planes turn slowly at different angles. Low-opacity circuit scaffolding extends
throughout the background without becoming a starfield or dense HUD. Rule Shift
alternates between position and direction rules across three trials, creating a
bounded interference-control exercise without claiming broad
executive-function transfer.

Completing a game records only its ID and the local calendar date. Its node
changes color for that day while only its blueprint shell makes one restrained
turn. The active route shows only playable games. Five small, low-opacity,
non-interactive `BlueprintShape`-derived **TBD** stations sit on the periphery
as capacity markers and are clearly subordinate to playable nodes. They do not
imply availability; a future exercise joins the active route only when
implemented. The orbital completion state is navigation and routine feedback,
not a cognitive score.

This decision is implemented and validated only for desktop web during the
current prototype phase. It does not reactivate mobile work.

## ADR-008: Desktop-web-only prototype validation

**Status:** Accepted — July 25, 2026

The active prototype target is desktop web. Routine implementation and
validation cover `packages/shared/` and `apps/web/` at the desktop viewport
only. The existing mobile scaffold and phone Playwright project remain parked
and opt-in; agents must not edit, build, typecheck, or test them unless the
owner explicitly reactivates mobile work. This avoids spending prototype
compute on a release surface that is not currently needed.

## ADR-009: EdgeCircuit is the working public brand

**Status:** Accepted; supersedes SharpMode — July 25, 2026

The owner selected **EdgeCircuit** as the working public brand. The web header,
page metadata, current product brief, and design references use EdgeCircuit.
The selected category descriptor is *Cognitive fitness for serious work.*
The broader vocabulary and claims guardrails are recorded in
`docs/brand-architecture.md`.

This is a prototype naming decision, not trademark clearance. Historical
naming records remain unchanged. Existing persistence keys, workspace package
names, game IDs, and the parked mobile metadata also remain unchanged so the
rename does not erase local history or create premature migration work.

## ADR-010: Five-game Daily Circuit with three reserve stations

**Status:** Accepted — July 25, 2026

The desktop-web Daily Circuit now contains five playable exercises: Pulse Path,
Digit Hold, Rule Shift, Signal Sweep, and Vector Match. The nodes share the
established blueprint construction language and travel at fixed separation
around the active route while their labels stay upright. The central completion
count is therefore out of five. This decision supersedes ADR-007 only where
that earlier decision specifies three playable nodes and five reserve markers;
ADR-007's motion, completion-state, visual-hierarchy, and evidence-aware design
rules remain in force.

Signal Sweep is a three-round selective visual-search exercise. Each round
presents one blueprint cue and ten candidates, with exactly one match on
contour, orientation, and index mark. The remaining candidates are controlled
near-matches rather than unrelated distractors.

Vector Match is a three-round spatial-discrimination exercise. Each round asks
whether a comparison is the same asymmetric blueprint figure under rotation or
a mirror reflection. Construction lines and index marks make reflection
distinct from rotation.

Both exercises report task-specific accuracy and response pace only. Practice
Charge may incorporate those measures under ADR-006, but the product does not
infer general attention, spatial intelligence, reasoning ability, workplace
readiness, or cognitive health from either task.

Three small, low-opacity, non-interactive **TBD** stations remain on the far
periphery as reserve capacity. They stay off the playable route and do not imply
availability. This expansion is implemented and validated only for desktop web;
mobile work remains parked under ADR-008.

## ADR-011: Daily Circuit membership is locally customizable

**Status:** Accepted — July 26, 2026

Players may customize the desktop-web Daily Circuit by moving implemented game
cards between the active circuit loop and a quiet playable reserve. Pointer
users can drag cards in either direction. Every drag action has an explicit,
keyboard-accessible **Add to circuit** or **Move to reserve** equivalent, and
the resulting location is announced. A reserved game remains launchable and
retains its normal identity and daily completion treatment; reserve does not
mean disabled or unavailable.

Circuit membership persists locally across refreshes and local calendar days.
It is stored separately from daily completion records, completed-session
history, and Practice Charge. Moving a game off the circuit therefore never
erases prior task results or charge contributions, and returning it to the
circuit restores its already-completed state when applicable.

The central Daily Circuit count is scoped to included games only. Its
denominator is the number of games currently on the loop, and its numerator is
the number of those included games completed on the current local day. With no
included games, the hub displays **Standby**; `0/0` is never treated or labeled
as **Complete**.

The reserve contains only implemented, playable games. ADR-013 subsequently
removes the earlier non-interactive **TBD** stations altogether. This decision
supersedes ADR-010 where its fixed five-node route and use of "reserve" for TBD
capacity imply otherwise. All mobile work remains parked under ADR-008.

The reserve is spatial rather than a tray: off-circuit games float in the
surrounding constellation and keep their exact locally persisted drop position.
Dropping a game onto the route sets its starting orbital phase. The whole card
is draggable with a generous invisible grab margin and a low movement threshold,
while the explicit add/remove control remains the keyboard equivalent. Playable
nodes use shells approximately 25 percent smaller than the earlier home nodes.
Their clockwise route motion is opposed by counterclockwise signal and
construction-plane flow so the circuit reads as an active mechanism rather than
a single rotating layer.

## ADR-012: Daily achievement badges use round count and task accuracy

**Status:** Accepted — July 26, 2026

The desktop home derives four daily achievement badges from the same completed
rounds that feed Practice Charge. First Loop, Momentum, and Full Circuit unlock
at 3, 9, and 15 completed rounds. Precision unlocks at 90 percent or better mean
task accuracy across at least six tracked rounds. Once unlocked, a badge remains
earned until the next local calendar day; all four reset with the daily Practice
Charge state.

The badges form a compact instrument cluster immediately around the central
Daily Circuit hub. They are small clipped labels rather than miniature game
shapes, remain visually subordinate to playable games, and use muted green plus
one restrained gold status mark when earned. They are practice
milestones, not measures of intelligence, readiness, health, or generalized
cognitive improvement. The system adds no streak, loss penalty, currency,
confetti, or social comparison. Mobile implementation remains parked under
ADR-008.

## ADR-013: Trace Pair replaces all speculative home placeholders

**Status:** Accepted — July 26, 2026

Trace Pair is the sixth implemented desktop-web exercise. Each of its three
rounds shows six open blueprint assemblies. Exactly two share an internal
connection topology while outer shell, datum location, and rotation vary. The
player selects the two related assemblies directly. This avoids the familiar
face-down-card, duplicate-picture, and location-memory patterns used by many
matching products. Results remain limited to accuracy and response pace on this
specific relational-matching task.

The home no longer renders **TBD** or future-capacity stations. Unimplemented
games have no visual footprint. Trace Pair receives its own launchable,
draggable home node and participates in daily completion and Practice Charge
like the other five exercises.

The desktop Daily Circuit contracts from roughly 900 by 640 CSS pixels to
roughly 790 by 560 pixels. This keeps the route a contained instrument while
leaving the surrounding constellation available for off-circuit games. Existing
local circuit membership remains authoritative, so Trace Pair appears
off-circuit for a player who has already customized a five-game circuit; a new
profile begins with all six games on the route. Mobile work remains parked under
ADR-008.

## ADR-014: Green daily completion is circuit-scoped

**Status:** Accepted — July 26, 2026

Muted green on a home game node means that the game was completed today while
it was included in the Daily Circuit. Games floating in the surrounding
constellation always retain their inactive blue-gray shell, including when
their persistent history badge records earlier sessions.

Completing a floating game may update its task-specific session history and
Practice Charge, but it does not add that game to the day's circuit-completion
set. Returning it to the loop later does not retroactively turn it green; the
player must complete it while it is on the circuit. This narrows ADR-011's
reference to reserve games retaining “daily completion treatment”: task history
is retained, but the green daily circuit state is not shown off circuit.

## ADR-015: The gold hub orbit carries daily task diagnostics

**Status:** Accepted — July 26, 2026

The four visible achievement medals established in ADR-012 are replaced on the
desktop home by a compact instrument cluster attached to the gold orbit around
the Daily Circuit hub. The cluster reports four current-day task measures:
mean completed-round accuracy; mean response time per scored item; mean
accuracy across Pulse Path and Digit Hold recall rounds; and completed rounds.
Measures without observations display an em dash.

The existing daily achievement engine and thresholds remain active, but the hub
shows only a quiet earned-badge tally. This keeps the nucleus useful between
sessions without presenting task scores as general cognitive diagnostics.
Labels and accessible descriptions must explicitly constrain the readouts to
the exercises completed today. The values reset with Practice Charge on the
next local calendar day, persist across refreshes, and do not imply
intelligence, readiness, health, or real-world transfer. Mobile implementation
remains parked under ADR-008.

## ADR-016: Practice Charge is circuit-aware

**Status:** Accepted — July 26, 2026

ADR-006's additive per-round battery is superseded by a daily 100-point
breakdown derived from the same aggregates shown around the central hub:

- 45 points for the share of selected circuit games completed today;
- 25 points for progress through three planned rounds per selected game;
- 20 points for mean task accuracy; and
- 10 points for response pace normalized per scored item and gated by accuracy.

Accuracy and pace phase in across six measured rounds. This prevents one fast,
perfect response from creating an inflated score. Selecting more games
increases the planned workload and never awards charge by itself. If the
circuit is empty, Practice Charge remains in standby at zero. Practice Charge
remains a daily practice-quality meter rather than a measure of intelligence,
readiness, health, or real-world cognitive transfer.

## ADR-017: Trace Pair constellation and nonblocking pace bonus

**Status:** Accepted — July 26, 2026

Trace Pair arranges its six blueprint assemblies around a central datum in a
loose circular constellation. A subtle radial spoke links every assembly to the
datum. Selected spokes turn gold; after a correct pair is submitted, its two
spokes resolve in muted green with a short traveling-line confirmation. This
keeps the relationship legible without returning to a rectangular card grid.

The four open-ended choice exercises—Rule Shift, Signal Sweep, Vector Match,
and Trace Pair—show a visible five-second descending hourglass. A correct
response within that window earns pace credit; faster responses can earn more,
with full pace credit at one second per scored decision and none at five
seconds. A correct response just inside the window always earns at least one
round-level pace point. Expiration never submits, fails, or closes a question:
it changes the hourglass to a closed state and leaves the answer available.

## Deferred Decisions

- Account provider and cross-device synchronization.
- Privacy-preserving product analytics.
- Notifications and streak mechanics.
- Selection and validation of future Daily Circuit exercises.
- Backend hosting and operational monitoring.
- Trademark clearance and final store identity.
