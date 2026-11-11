# Routine: tech-debt-sweep

Govern the existing scheduled tech-debt sweep. The trigger and its prompt
live in the owner's Claude app, not in this repo, so this document cannot
change the schedule. It sets the bar the sweep has to clear, which every
run picks up through `AGENTS.md` regardless of how the stored prompt is
worded.

```text
ROUTINE: tech-debt-sweep
PURPOSE: Decide whether recently merged code carries debt worth a PR,
  and refuse the ones that do not. No PR is the expected result.
OWNER: compass-maintainers
TRIGGER: scheduled routine in the owner's Claude app ("Tech debt cleanup")
INPUT: merges since the last entry in judged-fine.md, excluding prior
  sweep commits
SKILL/PROMPT: .agents/skills/tech-debt-sweep/SKILL.md
OUTPUT: at most one PR per sweep, plus an appended judged-fine.md block;
  usually just the appended block
IDEMPOTENCY: judged-fine.md closes an area until its behavior changes;
  files a prior sweep touched within 30 days are off limits
BUDGET: 1 PR per sweep (2 only if both are knip/lint/type findings in
  unrelated packages)
APPROVAL: merge queue required checks, same as any PR (see skills/ship)
STOP: no kill switch in the repo. Pause or delete the routine in the
  Claude app that owns the trigger.
HEARTBEAT: none. A clean sweep is one line and no notification.
VERIFIER: bun knip, bun lint, bun type-check (not the LLM)
NEVER: open a PR to justify a run that found nothing
```

Sources of truth:

| Concern | File |
| --- | --- |
| The bar, admissible findings, churn guard, budget | `.agents/skills/tech-debt-sweep/SKILL.md` |
| Areas already examined and kept | `.agents/skills/tech-debt-sweep/judged-fine.md` |
| Shared stop rules | `.agents/skills/anti-patterns.md` |
| Verify, PR, auto-merge | `.agents/skills/ship/SKILL.md` |
| Quality pass on a diff in flight (not this routine) | `.agents/skills/simplify/SKILL.md` |

## Why the bar exists

Between 2026-11-02 and 2026-11-09 the sweep merged eight refactors out of
50 merges. Five reworked the same date-picker hint cluster:
`EventFormDateField.tsx` and `LifeBirthDateField.tsx` were each rewritten
four times in seven days, by PRs titled "share the helpers", then "fold
leftover copies", then "fold the duplication", then "own the key
semantics", then "fold leftover hint copies".

Each PR was individually defensible and each passed review. In aggregate
they were churn: review attention, CI time, and regression risk spent on
code that was already correct, with no user-visible change. The same window
contained one finding that was actually worth shipping (#5187, a drifted
`WEEKS_PER_ROW` copy that could silently desync the life PDF grid from the
percentage printed beside it).

Three things caused the churn, and the skill addresses each:

1. A prompt listing many debt categories guarantees a category matches.
   The skill replaces the list with one question: what breaks if nobody
   touches this.
2. Re-reading a fixed trailing window every run re-surfaces the files the
   sweep itself just edited, which look like the densest debt precisely
   because they are freshest. The churn guard puts them off limits and the
   gate excludes prior sweep commits.
3. Nothing recorded a decision to leave code alone, so each run
   re-litigated settled ground. `judged-fine.md` is that record.

## Cadence

The merge history suggests the routine runs about daily. Compass does not
accumulate a day's worth of debt a day. Weekly or fortnightly is enough,
and a sweep that finds nothing should cost a few mechanical checks and a
ledger read rather than a full pass over a week of diffs. Changing the
cadence is a Claude app change the owner makes; the gate ordering in the
skill is what keeps an over-frequent run cheap in the meantime.
