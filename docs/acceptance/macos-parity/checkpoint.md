# Resume checkpoint

Read the newest operational entry first:
`/Users/tyler/.codex/automations/continue-macos-parity-overnight/memory.md`.
It records active runs without checkpoint-only pushes invalidating verified heads.
Repository worktree: `/Users/tyler/.codex/worktrees/845b/compass-calendar`.
Native UI XCTest runs only on isolated GitHub Macs. No local desktop takeover.

## Current package

Branch `test/macos-description-bullet-selection`, fixes #5014. New native UI
regression pastes equivalent rich text with soft breaks, selects only the five
place lines using real keyboard input, applies Bullet list and saves/reopens.
It checks exact visible text, preserved preceding literal list text and headings,
and semantic list state on every selected/nonselected line. Clipboard contents
are restored in teardown. The lower-level fixture now includes the previously
omitted sibling paragraph and asserts it is preserved, rather than asserting
absence of text never present. No production behavior changed or coverage weakened.
Acceptance remains unreviewed until isolated native/web results and capture review.

Ordered-list acceptance from merged #4984 is recorded with actual exact-head
verification and sampled capture evidence. Supported geometry, stored sidebar/theme
initial rendering, booking keyboard links, native startup performance and broad
visual/signed-in/final-build gates remain open. Counts do not establish parity.

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
