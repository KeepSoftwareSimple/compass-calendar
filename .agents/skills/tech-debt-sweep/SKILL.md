---
name: tech-debt-sweep
version: 1
owner: compass-maintainers
last_verified: 2026-11-09
description: Decides whether recently merged Compass code carries technical debt worth a PR, and refuses the ones that are not. Use for the scheduled tech-debt sweep, or when asked to review recent merges for debt, cleanup, or refactoring opportunities. Not for reviewing a diff you are writing; that is `simplify`.
---

## When

The scheduled tech-debt sweep, or an ask to review recent merges for debt.

For the branch you are writing right now, use `simplify` instead. This skill
judges merged code and spends PRs; that one cleans a diff in flight.

## Steps

Gate, then Ledger, then the three admissible checks, then at most one PR.

## Output

Usually nothing. At most one PR, or a line saying the sweep found nothing.

## Pass

Every PR this skill opens names a concrete divergence or failure it prevents.

## Anti-patterns

See [`anti-patterns.md`](../anti-patterns.md).

## Escalate

A finding whose fix changes behavior, a contract, or a product decision.

# Tech-debt sweep

## The bar

**The expected result of a sweep is no PR.** Compass is small, recently
reviewed, and already swept. A week that yields one real finding is a normal
week; a week that yields none is also a normal week and is reported in one
line, with no notification. A week that yields eight has not found eight
problems, it has lowered the bar eight times.

A sweep is not measured by what it ships. Shipping a marginal refactor is
worse than shipping nothing: it spends review attention, re-runs CI, risks a
regression in working code, and rewrites blame on a file someone may be
mid-change on. The null result is the cheap, correct, common answer.

So the question is never "can I find something that resembles an
anti-pattern". Resemblance is not debt. The question is:

> What breaks, or will break, if nobody touches this?

If there is no answer naming a specific mechanism, there is no finding.

## Gate: run the cheap checks first

In order. Stop at the first one that ends the sweep.

1. `bun knip` and `bun lint` and `bun type-check`. These are the only
   detectors that cannot flatter themselves. Anything they report is
   admissible without further argument.
2. Read [`judged-fine.md`](judged-fine.md). Everything listed there has
   already been examined and deliberately kept. Do not re-open an entry
   unless that code's behavior has changed since the date on it.
3. List candidate commits, and **exclude every previous tech-debt sweep
   commit**. The sweep's own output is not its input. A `refactor:` commit
   from a prior sweep is finished work, not a lead.
4. Only now read diffs, and only of feature and fix commits not covered by
   step 2.

If steps 1 to 3 leave nothing, the sweep is over. Say so in one line. Do not
go looking for something to justify the run.

## Churn guard

Before proposing any file, check it:

```sh
git log --since="30 days ago" --oneline -- <path> | grep -i refactor
```

**If a previous sweep touched that file in the last 30 days, it is off
limits**, unless the finding is a mechanical one from Gate step 1 or a
genuine correctness bug. No exceptions for "but this time it is really
duplicated".

This rule exists because of a real failure. Between 2026-11-02 and
2026-11-09 the sweep merged eight refactors, five of which reworked the same
date-picker hint cluster: `EventFormDateField.tsx` and
`LifeBirthDateField.tsx` were each rewritten four times in seven days, by
PRs titled "share the helpers", then "fold leftover copies", then "fold the
duplication", then "own the key semantics", then "fold leftover hint copies".
Each was defensible alone. Together they were churn on code that was already
fine. A file a sweep just touched is the *least* likely place to hold real
debt, not the most; it only looks otherwise because it is fresh in the diff.

## Admissible findings

Exactly three kinds. Each needs the evidence named next to it.

**1. Mechanical.** `knip` reports an unused file or export; `lint` reports a
rule; a type is wrong; a branch is provably unreachable. Evidence: the tool's
output.

**2. A drifted copy of a shared definition.** A constant, schema, or rule
exists in one owning module, and some other site re-implements it as a
literal or a parallel copy, so the two can disagree and no test would catch
it. Evidence: both sites, plus the observable symptom when they diverge.
This is the strongest class because the divergence is mechanical, not a
matter of taste. The 2026-11-09 `WEEKS_PER_ROW` finding is the model: the
life PDF hardcoded `52` while the percentage printed beside it in the same
attachment derived from the shared constant, so changing that constant would
have desynced a grid from its own caption silently.

**3. A hack whose condition has expired.** A comment or TODO documents a
workaround for something since fixed, or a dead migration path. Evidence:
the comment, and proof the condition no longer holds.

## Inadmissible, however strong the urge

- **Taste.** "Clunky", "could be cleaner", "a bit long" are not findings.
- **Collapsing two things that change for different reasons.** Shared shape
  is not shared intent. If two call sites would diverge under a plausible
  next requirement, the duplication is correct and folding it creates
  coupling. State that it should stay and move on.
- **Load-bearing mess.** Code wrestling a third party's internals, browser
  layout, or timing is ugly because the problem is ugly.
  `date-picker-keyboard-dom.util.ts` is the standing example: CSS-class
  queries and a bounded scroll loop against `react-datepicker`. Absent a
  real defect, leave it. A tidier version that regresses keyboard focus is a
  net loss.
- **A fix larger than the problem.** Weigh the code a fix adds against what
  it prevents. New abstraction to remove a two-line repeat is a loss.
- **Re-litigating a prior sweep's judgment call.** Folding what a previous
  sweep split, or splitting what it folded, with no new information.
- **Renaming for consistency**, absent a correctness or discoverability
  problem.

## Budget

- **At most one PR per sweep.** A second only if both are Gate step 1
  mechanical findings and touch unrelated packages.
- Behavior preserving. A behavior change belongs to a product decision and
  escalates instead.
- Ship through `ship`. The PR body names the divergence or failure prevented,
  and what was examined and deliberately left alone, so the next sweep does
  not redo it.
- Then **append every area you judged fine to `judged-fine.md`**, with the
  reason and the date. That file is the point of the sweep as much as the PR
  is: it is how the bar stays high without re-reading the same code forever.

## Reporting

- A PR opened: say which divergence it prevents.
- Nothing found: one line. No notification, no PR, no consolation refactor.
- A pattern in the sweep's own behavior (churn, repeat findings in one area,
  the bar slipping): tell the user. That is worth more than any single PR,
  and only the sweep can see it.
