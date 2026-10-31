# Resume checkpoint

Read the newest operational entry first:
`/Users/tyler/.codex/automations/continue-macos-parity-overnight/memory.md`.
It records active runs without checkpoint-only pushes invalidating verified heads.
Repository worktree: `/Users/tyler/.codex/worktrees/845b/compass-calendar`.
Native UI XCTest runs only on isolated GitHub Macs. No local desktop takeover.

## Current package

Branch `test/macos-booking-link-accessibility`, fixes #5026. New isolated AppKit
integration regression creates a real window and rich editor with both named
booking links. Real keyboard word selection must reach each link, expose its
full destination help and preserve HTML. It never activates external URLs.
Native caret selection is a platform-specific keyboard path; separate tabbable
AX elements, focus-ring visual review, full UI and signed-in evidence stay open.
Do not run this AppKit test locally. Inspect isolated normal package test results
first, diagnose failures, then exact-head native/web strict before ready/queue.
Existing description Tab routing and cancellation/clipboard tests are untouched.

Accounting PR #5020 merged 2026-10-31T18:16:32Z with exact0e0 native/web strict
PASS and no required skips. Five completed frozen source reviews are recorded;
future web changes remain deferred. All broad gates and parent #4783 stay open.

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
