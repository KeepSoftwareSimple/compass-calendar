# Skill registry

Durable procedures for Compass agents, one directory per skill. These are
files to read and follow, not slash commands. This is not a JS/TS barrel;
import nothing from here.

Bump `version` in `SKILL.md` frontmatter when the procedure changes and add a
line to **Change log**. Revert = `git revert`.

Shared stop rules: [`anti-patterns.md`](anti-patterns.md).

| name | version | owner | last_verified | purpose |
| --- | --- | --- | --- | --- |
| ship | 5 | compass-maintainers | 2026-11-02 | verify, PR, `gh pr merge --auto` |
| simplify | 2 | compass-maintainers | 2026-09-04 | behavior-preserving quality pass on a diff |
| a11y-audit | 1 | compass-maintainers | 2026-08-25 | review changed UI for accessibility regressions |
| chaos | 2 | compass-maintainers | 2026-09-04 | exploratory signed-in QA, then ship |
| google-sync-debug | 2 | compass-maintainers | 2026-09-04 | trace OAuth, provider, job, webhook, SSE failures |
| qa-test-staging | 1 | compass-maintainers | 2026-08-25 | post-deploy staging confidence sweep |

## Change log

- 2026-11-02: `ship` v5 drops the `agent-automerge` label and the merge-guard
  rails. Ready PR plus `gh pr merge --auto`; the merge queue's required checks
  are the gate. One re-queue after a drop the diff cannot explain, then stop.
- 2026-09-08: `ship` v4 enables auto-merge itself rather than stopping at the
  label, and stops treating a sandbox-bound Playwright timeout as a blocking
  verdict. Path prefixes were never a merge gate; the note says so explicitly
  so no routine hunts for a denylist that does not exist.
- 2026-09-04: retired `verify-change`, `review`, `handoff`, `booking-loop`,
  `local-dev-bootstrap`, and the `_evals` stubs. `bun run verify --strict`
  is the verdict; review is a CI job; status lives on the GitHub issue;
  the loop is `docs/CI-CD/agent-loop-routine.md`; local setup is
  `docs/development/local-development.md`.
- 2026-09-04: `/booking-loop` v2 became the agent-loop Routine.
- 2026-08-27: `/ship` v2 merged after verify without waiting for a human.
- 2026-08-25: added `version` / `owner` / `last_verified` to all skills.
