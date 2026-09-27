---
name: simplify
version: 2
owner: compass-maintainers
last_verified: 2026-09-04
description: Reviews changed Compass code for duplication, unnecessary complexity, weak boundaries, and overused React state/effects, then applies behavior-preserving improvements using repo conventions. Use when asked to simplify, clean up, make DRY, reduce complexity, or improve maintainability.
---

## When

Asked to simplify, clean up, or make DRY; also the nightly cleanup sweep.

## Steps

High-value detectors, then Compass conventions, then Verify.

## Output

Behavior-preserving diff; separate commit when files change.

## Pass

No behavior change; conventions from `AGENTS.md` kept.

## Anti-patterns

Do not “improve” by rewriting unrelated files. See
[`anti-patterns.md`](../anti-patterns.md).

## Escalate

A simplification that would change public behavior or contracts.

# Simplify Compass code

Favor the smallest, clearest implementation. This is a quality pass, not a
correctness or security review.

## Scope

- Default to the complete branch diff against its base. Honor a narrower file
  or feature scope when the user names one.
- Preserve behavior. Do not expand into unrelated cleanup.
- Find existing abstractions before creating new ones.
- If an inspected pattern should stay, state why.

## High-value detectors

Inspect in this order:

1. **Largest churn** — start where the diff added the most code and branches.
2. **Repeated scaffolding** — extract one helper only when the shared intent and
   parameter surface are clear.
3. **Test-only production hooks** — prefer narrow dependency injection over
   registries or environment branches added only for tests.
4. **Casts and broad mocks** — reshape the seam instead of hiding type or
   process-global coupling.
5. **Dead exports and unreachable guards** — verify call sites and invariants,
   then delete misleading code.
6. **Hidden shared state** — fix ownership/reset/injection rather than test
   ordering or timeouts.
7. **Comments explaining mechanics** — simplify the mechanism; retain comments
   that document constraints the code cannot express.

Do not unify code that only looks similar or break a repo-wide convention in
one file merely to remove repetition.

## Principles

### Minimal surface

- Add only what the current requirement needs.
- Prefer direct, boring code over generic machinery.
- Delete indirection that does not clarify ownership or contracts.
- Keep one responsibility per function and React component.
- Use guard clauses over nested conditionals.

### Extract versus inline

Extract when logic is used in multiple places, has shared intent, and admits a
narrow stable API. Inline when it is used once or extraction needs vague names,
optional parameters, or special cases.

### React state and effects

Challenge every added `useEffect`, `useRef`, and `useState`:

1. Derive values during render when possible.
2. Let Zustand own shared transient state and TanStack Query own server state.
3. Prefer an event handler or existing browser API over lifecycle
   synchronization.
4. Move or split the ownership boundary when local hook coordination is the
   real complexity.

Keep hooks that genuinely synchronize with non-React systems, hold imperative
DOM handles, or own isolated UI state. Record why they remain.

## Compass conventions

- Use package aliases and concrete source imports; do not add barrels.
- Put shared web/backend Zod contracts in `packages/core`.
- Keep React components in their own files.
- Preserve semantic web test queries and `user-event`.
- Use Tailwind semantic colors and canonical scale utilities.
- Prefer existing package locations:
  - shared logic: `packages/core/src/util`
  - web helpers: `apps/calendar-web/src/common`
  - backend helpers: `packages/backend/src/common`
  - sync ownership: `packages/sync/src`

Read `docs/development/testing-playbook.md` before changing test
architecture.

## Verify

Run the smallest checks that cover touched behavior:

- `packages/core` → `bun run test:core`
- `apps/calendar-web` → `bun run test:web`
- `packages/backend` → `bun run test:backend`
- `packages/sync` → `bun run test:sync`
- `packages/scripts` → `bun run test:scripts`
- shared contracts → affected package tests plus `bun run type-check`

`bun run verify` selects checks from the diff. Run `bun run lint` for
non-docs changes.

## Commit and report

When this skill was explicitly invoked to change code, commit the
simplification separately from implementation after verification, using a
lower-case conventional message such as:

```text
refactor(web): simplify event form state
```

Never amend implementation or push from this skill. If nothing changed, do not
create an empty commit.

Report:

1. the behavior-preserving simplification
2. principles applied and tradeoffs
3. checks run
4. React hook count direction and justification for retained hooks
5. commit hash/message, or that no commit was needed
