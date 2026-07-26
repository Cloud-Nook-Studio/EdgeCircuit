# Brain Training App Agent Instructions

## Purpose

Build a credible, enjoyable brain-training product. The current prototype
target is desktop web. Phone development is parked until the owner explicitly
reactivates it. Prioritize repeatable use, clear feedback, accessibility, and
evidence-aware claims.

## Current Prototype Scope

- Work only in the shared engine and desktop web client unless the owner
  explicitly requests mobile work.
- Do not edit `apps/mobile/`, run its typecheck/build, or run phone-viewport
  browser projects during normal prototype work.
- Keep mobile-capable architecture intact, but do not spend implementation or
  validation compute on it yet.

## Product Rules

- Build the usable training experience before marketing pages.
- Keep sessions short and easy to resume.
- Separate measured task performance from claims about general intelligence, memory, or health.
- Use proven libraries for authentication, synchronization, analytics, and established game mechanics when appropriate.
- Keep scoring and adaptive-difficulty logic in `packages/shared/` so web and mobile behave consistently.

## Design Source of Truth

- Read `docs/style-essence.md` before making user-visible design changes.
- Use `docs/design-direction.md` for the detailed geometric, color, type, motion, and interaction rules.
- Treat `docs/style-essence.md` as the canonical record of the product's aesthetic character; update it when the owner establishes a durable new preference.
- Preserve decisions that can later inform mobile, but do not implement or
  validate mobile layouts during the current prototype phase.

## Engineering Rules

- Prefer TypeScript across shared, web, and mobile code unless a later decision records a reason to diverge.
- Keep framework selection documented in `docs/decisions.md`.
- Add tests for scoring, progression, timing, persistence, and adaptive difficulty.
- Protect user performance data; collect only what improves the product.
- Follow existing repository patterns once the initial stack is selected.

## Workflow

1. Define the training loop and target user.
2. Record the architecture choice.
3. Build one complete vertical slice across shared logic and one client.
4. Validate usability on the desktop web viewport.
5. Expand only after the first loop is enjoyable and measurable.
