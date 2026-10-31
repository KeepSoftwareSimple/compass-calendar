# Resume checkpoint

Read the newest operational entry first:
`/Users/tyler/.codex/automations/continue-macos-parity-overnight/memory.md`.
It records active runs without checkpoint-only pushes invalidating verified heads.
Repository worktree: `/Users/tyler/.codex/worktrees/845b/compass-calendar`.
Native UI XCTest runs only on isolated GitHub Macs. No local desktop takeover.

## Current package

Branch `test/macos-description-list-persistence`, fixes #4983. New native UI
regression uses the real Numbered list control, types three items via Enter,
exits with double Enter, types a normal following paragraph, then saves/reopens.
It checks exact text, semantic ordered-list state at every saved item and normal
paragraph state afterward, with a retained screenshot. This fills a UI persistence
gap beyond existing two-item text-view and representation tests. No production
behavior changed; acceptance remains unreviewed until actual isolated verification.

Full guest-meet and boot-shell source reviews transferred into inventory. Public
web hosting/source/bundle checks and literal DOM/meta/script details have narrow
reviewed exclusions. Native window widths below720 are excluded with the actual
AppDelegate minimum-size reason. Supported-width geometry, stored sidebar/theme
initial rendering and native startup performance remain separate unresolved work.
The report can grow as coarse sources split into behaviors; counts are not parity.

## Verified history, do not repeat

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
next command and UTC reset times. Latest natural reset: primary4%, weekly46%,
resets1793417548/1793774272. Reset credits remain unused. Keep the existing active
30-minute heartbeat in chat01a18a4c-acd8-7791-9819-4f87caa8c156. No verified reset
trigger or execution guarantee while limited/asleep. Continue on the first eligible
recurring wake after reset without consuming credits.
