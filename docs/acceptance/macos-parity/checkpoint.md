# Resume checkpoint

Read the newest operational entry first:
`/Users/tyler/.codex/automations/continue-macos-parity-overnight/memory.md`.
It records active runs without checkpoint-only pushes invalidating verified heads.
Repository worktree: `/Users/tyler/.codex/worktrees/845b/compass-calendar`.
Native UI XCTest runs only on isolated GitHub Macs. No local desktop takeover.

## Current package

Branch `test/macos-welcome-body-enter`, fixes #5036. A separate native UI
regression clicks the welcome heading then presses Return and verifies the
second step and Next control, retaining a screenshot. Existing welcome tests
and production behavior are unchanged. Pending isolated exact-head native/web
strict verification and actual capture review before acceptance/ready/queue.
No local native UI execution or authentication flow.

The first head's full native suite and inspected step-two screenshot passed,
but strict web fast-typing cases failed on two runs. Focused unchanged tests
pass locally, including CPU throttling; no root cause or fix is claimed.
Strict CI now retains failed Playwright test-results for trace-based diagnosis.
Assertions, typing speed and timeouts are unchanged. New head needs fresh full
native/web verification; keep draft until successful actual evidence.

Named-link help acceptance from merged #5027 is recorded with actual exactaab
native/web strict PASS and unchanged keyboard integration regression. Separate
AX link focus, broad visual, real UI and signed-in gates remain open. Clock
blocker #5032 merged; preserve its worktree and do not rerun passing suites.
Frozen go-to-date source review now explicitly tracks three missing real native
keyboard/palette/date/announcement behaviors, beyond parser vectors.

## Verified history, do not repeat

- #4984 merged 2026-10-31T13:28:50Z. Exact e176 native/web strict41142347442
  PASS/no required skips, normal41142348480 PASS. New screenshot inspected
  `/tmp/compass-list-e176-shots`: final item and following paragraph visible at
  the current scroll position; the regression proves full text and each item's
  persisted semantic list state. No broad visual or signed-in acceptance claim.
- #4975 merged 2026-10-30T23:02:40Z. Fixed E-then-T title resolution colliding with
  standalone Today. Actual source03f native/web strict41124192953 attempt2 PASS,
  no required checks skipped, logs `/tmp/compass-et-03f-attempt2-strict`.
  Normal41124150486 PASS, title-focus screenshot inspected
  `/tmp/compass-et-03f-normal-shots`. Final groupnative41138901092 PASS. Original
  regression and pure dispatcher test failed before the fix and pass afterward;
  no assertions/timeouts/order were weakened. Standalone Today remains covered.
- #4959 merged 19:29:31Z. Exact455f native/web strict41067682308 PASS/no required
  skips; normal41067687764 PASS; new and both-theme captures inspected
  `/tmp/compass-meeting-455f-shots`; final groupnative41112036724 PASS.
- #4945 merged17:56:57Z. Actual sourcec635 native raw verify log PASS before
  wrapper timeout, web strict PASS; final groupnative41094751889 PASS. Cream/blue
  rounded/inset PNGs and extracted ICNS inspected. Installed Dock remains separate.
- System #4952 and popover #4942 merged. Preserve their worktrees and never edit
  merged branches. Earlier verified field-focus/recurrence/calendar/RSVP fixes
  remain historical evidence; do not duplicate them.

## Gates and resumption

Parent #4783 stays OPEN for real native signed-in RSVP and signed-build acceptance.
Visual, signed-in and final-build gates remain open. Fixture success, generated
captures and web staging do not establish those requirements. Future automatic
propagation of web changes is deferred.

Check usage each wake and before long work; checkpoint at80% of either window or
sooner in operational memory with branch/head, dirty paths, run IDs, evidence,
next command and UTC reset times. Latest observation: primary6%, weekly48%,
resets1793469777/1793774272. Reset credits remain unused. Keep the existing active
30-minute heartbeat in chat01a18a4c-acd8-7791-9819-4f87caa8c156. No verified reset
trigger or execution guarantee while limited/asleep. Continue on the first eligible
recurring wake after reset without consuming credits.
