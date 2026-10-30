# Resume checkpoint

Updated 2026-10-30. System branch `feat/macos-parity-flow`, worktree
`/Users/tyler/.codex/worktrees/845b/compass-calendar`. Read the runbook before work.
No local native UI automation is authorized. Do not modify the running app or
user desktop to triage these tests.

## Next work package

1. `python3 -B docs/acceptance/macos-parity/audit.py report`.
2. Inspect run40981800450 attempt2 native-only retry before further dispatch.
   If it fails again, diagnose the legend Escape failure on an isolated branch from main.
   Inspect `NativeGridKeyboardRouter.handleOverlayKeyDown`, root routing and
   legend search focus. Artifact proves legend remains visible. Existing native
   regression `NativeLaunchTests/testQuestionMarkTogglesShortcutsLegend()` already
   fails; preserve assertions, order and timeouts. Test only on isolated GitHub Mac.
3. Follow up #4945 after the failure is resolved or a justified exact-head retry
   establishes stability. Do not rerun successful web strict unnecessarily. Inspect
   actual downloaded logs before ready/autoqueue. Finish full resource/visual review.
4. Continue unreviewed/missing behavior mappings without repeating verified fixes.

## PR evidence

- #4942 merged 2026-10-30T01:13:18Z. No rerun needed. Head `5febbea35`, strict
  run40977549550 native/web PASS, no required checks skipped. Logs
  `/tmp/compass-popover-strict-pass`; inspected refs `/tmp/compass-popover-alpha-shots`.
- #4945 draft, head `c6354219a82ef0287770dbbfd264d43e8ede449c`, branch
  `feat/macos-theme-app-icons`, worktree
  `/Users/tyler/.codex/worktrees/macos-theme-app-icons/compass-calendar`.
  Full 78-line textual diff reviewed, resources still require final visual review.
  Normal native40981345021 PASS. Strict40981800450 web PASS with no checks skipped;
  native FAIL at NativeLaunchTests.swift:448, Escape leaves shortcuts legend open.
  Downloaded logs `/tmp/compass-icons-strict-c635/compass-{macos,web}-strict-log`.
  xcresult downloaded below `/tmp/compass-icons-strict-c635/results`.
  Failure video attachments `/tmp/compass-icons-legend-failure`; inspected final
  frame `/tmp/compass-icons-legend-final.png` shows legend visibly open. Native-only retry dispatched, run40981800450 attempt2, currently queued.
  Failed screenshot and synthesized Escape event attachment inspected first; full
  textual icon diff does not touch key routing. Retry tests intermittency, not a fix.
  Web passing strict leg retained; do not dispatch another whole-workflow run. Native result: 394 passed, 1 failed, 14 skipped tests (inspect reasons
  before acceptance; a workflow success cannot replace required coverage).
  Local app `/tmp/compass-theme-icons-derived/Build/Products/Debug/Compass.app`
  already running from prior request. Do not take over desktop.

## Scope and limits

661 frozen baseline sources, mostly unreviewed. Mobile gate source inspected and
split into phone-only handoff exclusion and independent drag/tap gameplay gaps.
Prior fixed #4939/#4929/#4926/#4918/#4916/#4902 and recurrence/calendar/RSVP remain
historical evidence, not newly proved full source equivalence. No full parity claim.
Parent #4783 remains open for real native signed-in RSVP and signed-build acceptance.
Web staging Oct27 acceptance does not satisfy it. Visual and signed-in gates open.

Latest account observation: ordinary usage allowed, primary 5%, weekly 35%.
Primary reset Unix1793380147; weekly reset Unix1793774272 (UTC timestamps).
Reset credit remains available, unused. Check live usage each wake; checkpoint at
80% of either window or sooner before long work. Retain ACTIVE automation
`continue-macos-parity-overnight`, current chat `01a18a4c-acd8-7791-9819-4f87caa8c156`,
30-minute fallback. Config re-read verified current target and interval. No verified
reset-specific scheduler trigger; retry at first eligible fallback wake after reset.
Never redeem credits. Quiet while unchanged. Computer and app must remain running.

## Latest work package, 2026-10-30T13:25Z wake

System PR #4952 remains ready/auto-merge enabled; accounting CI PASS, other CI
still running. Do not rerun passing suites. Reviewed full web meeting-copy source
and two native candidates: clipboard/toast shortcut has actual method PASS evidence;
keycap visibility and Google Meet label assertions are missing, wide-window geometry
remains unreviewed. This narrows coverage honestly without claiming UI defects.
Usage primary8%, weekly35%, primary reset1793380146, weekly1793774272.
No reset credits consumed. Next inspect native retry artifacts and system PR queue.
