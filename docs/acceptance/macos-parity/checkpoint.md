# Resume checkpoint

Latest operational run IDs and queue state live in
`/Users/tyler/.codex/automations/continue-macos-parity-overnight/memory.md`.
Read that first: it updates without invalidating active exact-head verification.
Repository worktree: `/Users/tyler/.codex/worktrees/845b/compass-calendar`.
No local native UI XCTest or desktop takeover is authorized.

## Current package

Branch `test/macos-edit-title-sequence`, fixes #4973. A new native regression
creates and saves a title, confirms its focused grid card, presses E then T and
asserts visible actual title-input focus plus exact saved text. Existing #4929
Cmd+1 focus restoration coverage stays intact. The new regression exposed a real
dispatcher collision: resolved title T also dispatched Today before opening the
form. A minimal early return preserves leader resolution; standalone T still
navigates Today. A pure dispatcher regression failed before the fix and all16
KeyboardEngineTests pass after it. New UI verification is pending. New test stays unreviewed in the
inventory until exact-head isolated native/web strict logs and screenshot are
inspected. Local lint, Swift contracts/export and five accounting regressions pass.
Full diff reviewed. Production shortcut dispatch is corrected; existing UI
assertions, timeouts and order are preserved.

Inventory now records complete source reviews of title sequence, booking links,
list editing and two browser build tools. Browser-only modulepreload and JS budget
assertions have narrowly reviewed exclusions; native launch performance is not
excluded. Booking-description interaction and list persistence gaps are explicit,
with lower-level tests retained as partial evidence. No count-based parity claim.

## Shipped and pending evidence

- Theme icons #4945 merged 2026-10-30T17:56:57Z. Native source head c6354219a
  actual downloaded raw job log `/tmp/compass-icons-attempt3-job.log` reports full
  VERDICT: PASS, Checks skipped:(none), before the enclosing job timed out after
  completion. Web exact-head strict PASS. Current merge-group41094751889 PASS.
  Rounded/inset cream-blue PNGs and extracted ICNS visually inspected. Installed
  Dock and real signed-in acceptance remain separate. Do not rerun or edit branch.
- Meeting copy #4959 source455f011a9, actual BOTH strict41067682308 PASS/no required
  skips in `/tmp/compass-meeting-455f-both-strict`. Full normal41067687764 PASS.
  New copy and both-theme focus screenshots inspected `/tmp/compass-meeting-455f-shots`.
  Queue removed it for checks_timed_out during Mac capacity delays; its group
  native41085643670 subsequently PASS. Reenqueued once, actual mergeQueueEntry
  verified position4 AWAITING_CHECKS. Do not duplicate dispatches or reenqueue
  while still queued. Record meeting-name acceptance after its implementation merges.
- System #4952 and popover #4942 merged. Prior fixes #4939/#4929/#4926/#4918/
  #4916/#4902 and recurrence/calendar/RSVP are historical verified evidence; do
  not repeat them. The legend's original intermittent Escape failure is not
  claimed fixed merely because later runs passed.

## Remaining acceptance and resumption

Parent #4783 remains OPEN for real native signed-in RSVP and signed-build checks.
Web staging, fixtures and generated screenshots do not satisfy native acceptance.
Visual, signed-in and final-build gates remain open. Future automatic propagation
of web changes is deferred.

Read account usage each wake and before long work; checkpoint at 80% of either
window or sooner. Latest observation: primary7%, weekly40%, reset timestamps
1793399190/1793774272 UTC. Natural reset occurred; reset credit remains unused.
Keep existing ACTIVE30-minute heartbeat in chat01a18a4c-acd8-7791-9819-4f87caa8c156.
No verified reset-event trigger: resume at first eligible recurring wake after
reset. Never redeem reset credits or promise execution while limited/asleep.
