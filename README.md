# EdgeCircuit

**Cognitive fitness for serious work.**

EdgeCircuit is currently a desktop-web prototype for short, repeatable
cognitive-training sessions with clear, task-specific feedback. The mobile
scaffold remains in the repository for a later phase but is not under active
development or included in default validation.

The web Daily Circuit currently includes six exercises: **Pulse Path**,
**Digit Hold**, **Rule Shift**, **Signal Sweep**, **Vector Match**, and
**Trace Pair**. Each exercise runs for three rounds with task-specific
feedback. Scores describe performance on the exercise played; the app does not
claim to measure intelligence, general memory, executive ability, or cognitive
health.

## Repository

```text
apps/
  web/       React + Vite browser client
  mobile/    Parked Expo/React Native scaffold; not in prototype validation
packages/
  shared/    Seeded rounds, scoring, adaptation, sessions, and persistence
docs/
  conversation-log-naming.md
  decisions.md
  design-direction.md
  naming-options.md
  product-brief.md
  science-and-training-design.md
  style-essence.md
  release-checklist.md
  security-notes.md
```

The web client owns current presentation, input, and device storage. Rules
that could change a result remain in `packages/shared` so mobile can reuse them
later without requiring mobile implementation work now.

## Requirements

- Node.js 22.13 or newer
- npm 11 or newer

## Start locally

### Windows quick start

Double-click **`OPEN APP.cmd`** in the repository root. It starts the web
server when necessary, waits for it to be ready, and opens the app in your
default browser at `http://127.0.0.1:5173`.

### Terminal

```bash
npm install
npm run dev:web
```

Open the local URL printed by Vite. Mobile startup and release work are
deliberately deferred during the desktop-web prototype phase.

## Verify the workspace

```bash
npm run check
```

This runs shared-engine tests, TypeScript checks for the shared package and web
client, and their production builds. It deliberately skips the mobile
workspace.

Useful focused commands:

```bash
npm run test
npm run test:e2e
npm run typecheck
npm run build
```

The default end-to-end suite runs the real desktop browser flow at 1440×1000,
including exit/discard behavior, reload behavior, and horizontal-overflow
checks. On Windows it uses the installed Microsoft Edge channel. On another
platform, install Playwright's Chromium once with
`npx playwright install chromium`.

Phone-viewport and mobile workspace checks are parked. Their commands are
explicitly named `npm run test:e2e:phone`, `npm run typecheck:all`, and
`npm run build:mobile`; do not run them until mobile work is reactivated.

## Product boundaries

- Unfinished sessions are disposable: **Exit to home** discards the run, and
  the app does not offer save or resume controls.
- Only completed sessions influence the next starting difficulty. Difficulty is
  fixed within a session and adapts between sessions toward a 70–85% success
  band on that exercise; it eases immediately after a session that was clear
  overload. All seven exercises now scale: path length, digit span, candidate
  signals, assemblies per round, rotation difficulty, interference, and people
  per round. Each setup screen exposes its own demand directly.
- Each completed session is kept as one timestamped per-game observation, so
  accuracy can be read as a trend rather than only as a running mean. A game
  shows a trend mark only once there are enough observations to support a
  direction.
- Response speed does not affect task score or adaptation. A broad,
  accuracy-gated pace band contributes at most four points per round to the
  separate daily Practice Charge.
- Version 0 has no account, cloud sync, ads, or raw tap telemetry.

See [the product brief](docs/product-brief.md) for the loop and claims policy,
[the science and training design brief](docs/science-and-training-design.md)
for the evidence review and product recommendations,
[the style essence](docs/style-essence.md) for the canonical product character,
[the design direction](docs/design-direction.md) for its detailed visual rules,
[the decision log](docs/decisions.md) for architecture rationale, and
[the brand architecture](docs/brand-architecture.md) for the active EdgeCircuit
language system and [the naming options](docs/naming-options.md) for the
working-name record. The cleaned source discussion is preserved in
[the naming conversation log](docs/conversation-log-naming.md), with the
latest shared-chat ingest in
[the historical SharpMode naming record](docs/shared-chat-sharpmode.md). See the
[release checklist](docs/release-checklist.md) before web deployment or store
submission, and [the security notes](docs/security-notes.md) for the current
dependency advisory assessment.
