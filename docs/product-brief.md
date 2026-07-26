# EdgeCircuit Training Loop

## Who it is for

EdgeCircuit is for adults who enjoy a short daily challenge and want feedback
about their performance on the task they just played. It is recreational
training, not a medical, diagnostic, or therapeutic product.

The web Daily Circuit contains six task-specific exercises:

- **Pulse Path:** visuospatial sequence maintenance and recall.
- **Digit Hold:** short-term serial recall.
- **Rule Shift:** choose by signal position or arrow direction under an
  alternating interference rule.
- **Signal Sweep:** locate one exact signal among controlled near-matches.
- **Vector Match:** distinguish rotation from mirror reflection.
- **Trace Pair:** select two differently presented assemblies with the same
  internal connection topology.

Completing a game changes its orbital node for the current local day. This is a
workout-navigation state, not a combined cognitive score.

## The first session

1. Start a three-round session at a chosen path length.
2. Watch a sequence move through a free-floating geometric constellation.
3. Repeat the sequence with touch, mouse, or the number keys 1–9.
4. See how many positions were recalled and why the round earned its points.
5. Continue at the selected sequence length.
6. Review score, task recall rate, perfect rounds, and longest perfect sequence.

There is no response countdown and response speed does not affect Pulse Path
task points or difficulty. A first incorrect choice ends the round, which keeps
the rule easy to understand on both web and phone. The separate daily Practice
Charge uses a small, accuracy-gated pace component described in ADR-006.

## Scoring

For a sequence of length `L` with a correct prefix of `C`:

```text
round points = (10 × C) + (perfect round ? 5 × L : 0)
```

Examples:

- two correct positions from a four-position path: 20 points;
- a perfect four-position path: 60 points.

## Difficulty

- Starting sequence length: 3
- Minimum: 2
- Maximum: 8
- Two perfect rounds in a row: increase by one
- Two imperfect rounds in a row: decrease by one
- An opposite result resets the active streak

The next completed session starts at the final level of the most recent
completed session. An abandoned session does not change that starting level.

## Evidence-aware language

Use language such as:

- "Practice remembering short visual sequences."
- "This score reflects your Pulse Path performance."
- "Your recall rate improved across these sessions."

Do not say or imply:

- a score measures intelligence or general memory;
- practice diagnoses, treats, or prevents a health condition;
- a short-term task score proves broad cognitive improvement.

## Accessibility baseline

- Grid targets are at least 48×48 CSS pixels or density-independent pixels.
- Selected and highlighted states use shape/outline as well as color.
- The web grid supports number keys 1–9 and normal focus navigation.
- Phase changes and round results have readable text announcements.
- Reduced-motion and high-contrast preferences are available.
- Sound and haptics are optional enhancements, never required information.
- **Exit to home** discards an unfinished session without a penalty or
  confirmation step.

## Data minimization

Version 0 persists only completed summary metrics and settings. A deterministic
active session may exist transiently while Pulse Path is open, but it is
cleared on exit or startup and cannot be resumed. The app does not store raw
tap trails, health data, contacts, precise location, or advertising
identifiers.
