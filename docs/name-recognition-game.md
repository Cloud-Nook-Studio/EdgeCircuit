# Name Recognition Game — Recommended Setup

## Product recommendation

Use a **face–name association** exercise with a forced-choice recognition test.
Working game name: **Name Match**.

The game should remain a short, three-round visual memory exercise. It should
report performance on this task only and should not be presented as a dementia
screen, diagnostic tool, or proof of general memory improvement.

## Core loop

Each round has three phases:

1. **Meet** — show fictional people one at a time with a first name.
2. **Hold** — clear the study cards and show a short neutral transition.
3. **Match** — show each face with three possible names.

After an answer, show the correct name briefly and move to the next face. At the
end of the round, show one simple confirmation and continue automatically.

## Three-round progression

| Round | Pairs to learn | Exposure per pair | Recognition choices |
| --- | ---: | ---: | ---: |
| 1 | 3 | 4 seconds | 3 |
| 2 | 4 | 4 seconds | 3 |
| 3 | 5 | 4 seconds | 3 |

This produces 12 scored associations in a session. Difficulty increases through
memory load, not shorter timers.

## Distractor design

Every recognition question should contain:

- the correct name;
- one name previously paired with another face in the same round;
- one new name that was not studied in that round.

Shuffle option order for every question. Avoid visually similar names in the
first version (for example, Kara/Tara or Jon/John), because spelling confusion
would add a second task that is not the intended construct.

Use common, culturally varied first names with reasonably familiar phonology.
Do not infer or assign names based on a portrait's perceived ethnicity, gender,
or age. Pair names and portraits independently from balanced pools.

## Portrait assets and privacy

- Use a curated, licensed or purpose-generated set of fictional adult portraits.
- Keep crop, lighting, background, expression, and image quality consistent.
- Build a demographically varied set and audit performance by asset; replace
  portraits that create persistent difficulty unrelated to the name association.
- Never use a player's contacts, social photos, camera roll, or biometric
  templates in the initial product.
- Store only portrait IDs, presented name IDs, choices, and task performance.
- Do not present synthetic portraits as real people.

The exercise is inherently visual. Alt text must not reveal the answer. A future
nonvisual companion mode should use a different association task, such as
voice–name matching, and be reported separately rather than treated as the same
measure.

## Scoring

Keep scoring in `packages/shared/`.

- 1 point for each correct face–name match.
- Round accuracy: correct matches / pairs presented.
- Session accuracy: total correct / 12.
- Exact rounds: rounds with every association correct.
- No speed bonus.
- Optional future metric: first-choice confidence, collected only after usability
  testing shows it adds value without slowing the game.

Do not reuse portraits or exact portrait–name pairings within a session. Across
sessions, rotate from a sufficiently large pool so improvement is not merely
memorization of a small fixed deck.

## Proposed shared model

```ts
type NamePair = {
  portraitId: string;
  nameId: string;
};

type RecognitionTrial = {
  portraitId: string;
  optionNameIds: [string, string, string];
  correctNameId: string;
};

type NameRoundResult = {
  pairCount: number;
  correctCount: number;
  responses: Array<{
    portraitId: string;
    selectedNameId: string;
    correct: boolean;
  }>;
};
```

Shared logic should create deterministic pairings and distractors from a seed,
prevent duplicate portrait/name use within a session, score responses, and
validate persisted data.

## Evidence behind the setup

Face–name tasks are associative-memory tasks: the challenge is binding an
unfamiliar face to a proper name. Published designs commonly separate encoding
and retrieval, and recognition variants use matching or multiple-choice tests.

Useful design references:

- James et al. used both matching and multiple-choice recognition for unfamiliar
  face–name associations:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC2562247/>
- A face–name association task used a four-name retrieval display containing the
  correct name, previously presented distractors, and a new name:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC3958642/>
- A three-choice recognition design used the correct name, a name paired with a
  different studied face, and an unstudied name:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC3575179/>
- Repeated face–name exposure improves recall, but age differences can remain;
  this supports measuring the task without overstating transfer:
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC8292925/>

## Build order

1. Create and audit a 24-portrait / 36-name development asset pack.
2. Add deterministic pairing, distractor, and scoring logic with tests.
3. Build one complete round on web.
4. Validate portrait legibility and choice spacing on phone viewports.
5. Add all three rounds and mobile parity.
6. Add the third landing-screen tile only when the full loop is usable.
