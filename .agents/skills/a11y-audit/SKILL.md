---
name: a11y-audit
version: 1
owner: compass-maintainers
last_verified: 2026-08-25
description: Audits changed Compass UI for accessibility regressions in semantics, names, keyboard and focus behavior, ARIA, contrast, motion, and testability, then proposes minimal diff-scoped fixes. Use for UI diff reviews, accessibility audits, or flaky interaction tests.
paths:
  - "apps/calendar-web/**/*.{ts,tsx,css}"
  - "e2e/**/*.{ts,tsx}"
---

## When

UI diff review, accessibility audit, or flaky interaction tests.

## Steps

Workflow, then Checklist, scoped to the diff.

## Output

Minimal diff-scoped findings and proposed fixes.

## Pass

Changed UI reviewed; no site-wide unrelated audit.

## Anti-patterns

Do not expand into an unrelated site-wide audit. See
[`anti-patterns.md`](../anti-patterns.md).

## Escalate

A WCAG judgment that needs a human, or a contrast issue that needs design.

# Accessibility change audit

Audit the changed UI and its immediate context. Do not turn a diff review into
an unrelated site-wide audit.

## Workflow

1. Identify changed elements, interactions, states, and styles.
2. Exercise affected behavior with the browser tooling available to the
   current agent when static inspection cannot establish focus, keyboard,
   contrast, or motion behavior.
3. Run the checklist below.
4. Tie each finding to a changed line or behavior and propose the smallest
   durable fix.
5. Recommend role/name queries and user-driven tests.

## Checklist

### Semantics and names

- Heading order and landmarks remain meaningful.
- Interactive elements use native buttons, links, inputs, lists, and tables.
- Inputs, icon controls, dialogs, and regions have accessible names.
- Helper/error text is connected with `aria-describedby` when appropriate.

### Keyboard and focus

- Every interaction is keyboard reachable and operable.
- Focus order follows DOM order; avoid positive `tabIndex`.
- Dialogs, menus, and popovers place, contain, and return focus correctly.
- Composite widgets implement the expected arrow, Home/End, Enter, Space, and
  Escape behavior.

### ARIA and state

- Use ARIA only where native semantics are insufficient.
- `aria-expanded`, `aria-selected`, `aria-pressed`, `aria-controls`, and
  `aria-activedescendant` reflect actual state and relationships.
- Hidden/disabled content is not accidentally focusable.
- Live updates and errors are announced when users need them.

### Visual behavior

- Text, controls, and focus indicators meet Compass's WCAG 2.2 AA target.
- Color is not the only state indicator.
- Motion respects reduced-motion preferences.
- Zoom, narrow layouts, and reflow do not hide essential controls.

### Tests

- Query by role and accessible name rather than CSS or `data-*`.
- Drive interactions with `user-event`.
- Test meaningful state and focus outcomes, not only element presence.
- Reuse existing Playwright/axe checkpoints; add one only for a newly exposed
  representative state.

Read `docs/development/testing-playbook.md#accessibility-testing` before
changing axe configuration or adding browser checkpoints.

## Output

Order findings by `blocker`, `high`, `medium`, then `low`:

```text
[severity] path:line — problem and user impact
Fix: smallest durable change
Test: semantic assertion or user flow that protects it
```

State when no findings are confirmed. Separate automation results from
judgment-based observations and never claim automated checks establish full
WCAG conformance.
