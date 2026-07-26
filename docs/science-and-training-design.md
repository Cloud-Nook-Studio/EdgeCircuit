# Science and Training Design

Last reviewed: July 25, 2026

## Product position

The strongest evidence-aligned position is:

> A short cognitive warm-up that practices specific working-memory, attention,
> and control skills and shows how performance changes over time.

The app should not promise a rapid increase in intelligence, broad executive
ability, productivity, or brain health. Cognitive training reliably improves
the practiced task. Evidence for transfer to closely related tasks is smaller
and inconsistent; evidence for broad, real-world transfer is weak.

That boundary can be a competitive advantage. Busy professionals are likely to
value a product that is precise about what it trains, quick to use, and
unusually good at showing meaningful task-level progress.

## What the evidence says

### 1. Direct practice effects are real; broad transfer is not established

A major review of commercial brain-training evidence found support for
improvement on trained tasks, less support for related-task transfer, and
little convincing evidence for improvements in everyday cognition. A
meta-analysis of 87 working-memory-training publications likewise found
short-term improvements on verbal and visuospatial working-memory measures but
no convincing far transfer to intelligence or real-world academic skills when
compared with active controls.

A 2024 second-order meta-analysis of six meta-analyses reported a small average
working-memory benefit in healthy adults (standardized mean difference 0.335)
and explicitly cautioned that real-life utility may be minimal.

Product implication:

- Report improvement in Pulse Path, Digit Hold, and other named tasks.
- Describe the underlying process being practiced, not a generalized ability
  that has not been independently measured.
- Treat broad transfer as a research question, not a marketing fact.

### 2. Adaptation is promising, but not a guarantee of transfer

Adaptive difficulty keeps a task challenging and can improve training
efficiency. One controlled study found wider transfer and neural changes after
adaptive versus fixed working-memory updating practice. Other preregistered
and randomized studies found robust direct training effects but limited or no
near and far transfer.

Product implication:

- Keep challenge responsive to the user.
- Target an initial success band around 70–85% and tune it with product data.
  This band is a design hypothesis intended to avoid boredom and overload, not
  a scientifically settled optimum.
- Do not present adaptive difficulty itself as proof of cognitive transfer.

### 3. Controlled novelty is better than visual predictability

Users should learn the cognitive rule, not memorize a permanent board. At the
same time, changing every visual detail during a three-round attempt adds
unnecessary task-switching and makes performance harder to interpret.

Product implication:

- Hold one constellation stable for all three rounds.
- Generate a new spatial arrangement and shape-to-position mapping at the
  start of the next three-round session.
- Vary surface features across sessions while keeping the underlying rule
  stable.
- Later, compare stable and varied conditions experimentally to determine
  whether novelty improves retention, engagement, or related-task transfer.

This is an evidence-informed design decision, not evidence that randomized
shapes alone produce broader cognitive gains.

### 4. A permanent “edge” requires repeated practice, not one quick session

In a preregistered executive-function experiment, participants completed 10
adaptive sessions over 21 days. Direct effects were robust, while generalized
effects were limited. Other working-memory studies commonly use multiple weeks
of practice.

Product implication:

- Keep an individual session near two minutes.
- Build a habit target of 3–5 sessions per week for 4–6 weeks.
- Use streaks sparingly; emphasize consistency and recovery rather than guilt.
- Show rolling trends only after enough observations to reduce noise.

### 5. For an immediate cognitive state change, movement and sleep matter

An individual-participant meta-analysis found beneficial after-effects of acute
aerobic exercise on cognitive performance, especially among people with lower
baseline performance. Separate meta-analytic evidence shows sleep loss impairs
working memory, inhibitory control, and cognitive flexibility.

Product implication:

- Offer an optional “prime first” suggestion: a brief walk or movement break
  before a high-stakes work block.
- Let users tag sleep/readiness and compare it with their task performance.
- Frame these as context and self-observation, not medical advice.
- Never imply the game compensates for sleep loss.

## Recommended executive training loop

### Daily warm-up: approximately two minutes

1. **Settle — 10 seconds.** One quiet orientation screen. No motivational
   noise or countdown pressure.
2. **Train — three rounds.** Stable rule and constellation; adaptive sequence
   length; immediate checkmark; no interstitial review screen.
3. **Reflect — 10 seconds.** One result: task accuracy, best span, and
   consistency. Avoid composite “brain age” or IQ-style scores.
4. **Transfer cue — optional.** Ask what follows: deep work, presentation,
   decision review, or recovery. This creates a useful routine without claiming
   the game caused better job performance.

### Weekly variety

Use a small family of clearly labeled tasks:

- **Pulse Path:** visuospatial sequence maintenance and recall.
- **Digit Hold:** short-term serial recall.
- **Interference Control:** respond to a rule while ignoring a distractor.
- **Switch Point:** alternate between two simple rules.
- **Update:** replace older items as new information arrives.

Vary visual treatments and examples across sessions. Do not combine all
mechanics into one opaque “executive function” score.

## Measurement and claims

### Safe, supportable language

- “Practice visuospatial working memory.”
- “Build a consistent cognitive warm-up.”
- “Track accuracy, span, and consistency on this exercise.”
- “Adaptive sessions stay challenging as your task performance changes.”

### Avoid without a controlled product trial

- “Increase your IQ.”
- “Become smarter in two minutes.”
- “Improve executive performance at work.”
- “Prevent cognitive decline.”
- “Clinically improve memory or attention.”
- “Scientifically proven to rewire your brain.”

### Metrics worth building

- Accuracy and correct prefix by task and difficulty.
- Maximum exact span.
- Response consistency, not just a single best score.
- Performance by time of day and optional readiness tag.
- Retention after 24 hours and seven days.
- Related-task probes that are not visually identical to training.

Do not let faster tapping affect task score or difficulty unless speed is
explicitly part of the task. Pulse Path continues to prioritize correct order
over reaction time. The separate Practice Charge may use a small, broad,
accuracy-gated pace component as an engagement signal; it is not a task score
or validated cognitive measure.

## Validation roadmap

1. **Usability study:** confirm that professionals understand each task and can
   finish a session in under three minutes without instruction.
2. **Reliability study:** determine how many sessions are needed for a stable
   estimate of span and accuracy.
3. **Active-control pilot:** compare adaptive training with an equally engaging
   non-working-memory activity.
4. **Preregistered trial:** test trained-task improvement as the primary
   outcome; related-task transfer as secondary; work-performance outcomes as
   exploratory.
5. **Claims review:** expand product language only if the app itself—not merely
   a similar task—demonstrates the relevant outcome.

## Primary sources

- Simons DJ, et al. (2016), [Do “Brain-Training” Programs
  Work?](https://www.psychologicalscience.org/journals/pspi/1529100616661983/)
- Melby-Lervåg M, Redick TS, Hulme C. (2016), [Working Memory Training Does Not
  Improve Performance on Measures of Intelligence or Other Measures of Far
  Transfer](https://journals.sagepub.com/doi/10.1177/1745691616635612)
- De Lillo M, et al. (2021), [Training executive functions using an adaptive
  procedure over 21 days](https://pubmed.ncbi.nlm.nih.gov/33656380/)
- Gavelin HM, et al. (2019), [Adaptive task difficulty influences neural
  plasticity and transfer of
  training](https://pmc.ncbi.nlm.nih.gov/articles/PMC6401296/)
- Vartanian O, et al. (2022), [Adaptive working memory training does not
  produce transfer effects in cognition and
  neuroimaging](https://pubmed.ncbi.nlm.nih.gov/36513642/)
- Ishihara T, et al. (2021), [The effects of acute aerobic exercise on executive
  function](https://pubmed.ncbi.nlm.nih.gov/34147558/)
- Cao Y, et al. (2025), [The impairments of sleep loss on core executive
  functions](https://pubmed.ncbi.nlm.nih.gov/40946426/)
- Linares R, et al. (2024), [Examining Working Memory Training for Healthy
  Adults—A Second-Order
  Meta-Analysis](https://pubmed.ncbi.nlm.nih.gov/39590641/)
