# Resume checkpoint

Read the newest operational entry first:
`/Users/tyler/.codex/automations/continue-macos-parity-overnight/memory.md`.
It records active runs without checkpoint-only pushes invalidating verified heads.
Repository worktree: `/Users/tyler/.codex/worktrees/845b/compass-calendar`.
Native UI XCTest runs only on isolated GitHub Macs. No local desktop takeover.

## Current package

Branch `chore/macos-go-to-date-evidence`: record only the navigation portion of
merged #5091, splitting each frozen go-to-date case from its actual accessibility
announcement requirement. All three native bare-G date cases passed at exact
d7c39bc7607d3fbcf7f2e55a7ebbed4da08bdda9. Downloaded native/web strict41827629001
logs show PASS with no checks skipped; normal native41827631836 and merge-group
native41835411040 passed. All three retained captures were inspected in
`/tmp/compass-gdate-d7c-shots`: palette closed and chosen date visible, with a
matching month-picker selection. These are sampled light-theme captures.

Announcement rows stay missing: parser vectors prove strings, but the native
statusAnnouncement store value has no UI/AX consumer found. Review proper native
accessibility notification integration and meaningful observation; never substitute
fake visible test text or infer an announcement from successful navigation.

No product/test changes in this accounting package. Visual, signed-in, supported
geometry, startup/performance and final-build gates remain open under #4783.
Future web propagation remains deferred. Human-closed #5037 stays closed.

Post-#5173 (landed `bccdf2793` on `main`): `main` was merged into this branch at
exact head `f7ab84008d53dd5b57ea2537e55b2e0720f63d75` (includes `bccdf2793`). One
intentional `workflow_dispatch` of `test-macos.yml` with `strict_verify=true` on
that head: run **42315716184**
(https://github.com/KeepSoftwareSimple/compass-calendar/actions/runs/42315716184).
Native job `strict`: downloaded artifact `compass-macos-strict-log` shows
`VERDICT: PASS` in `macos-strict.log`. Web: matrix legs `strict-web-leg-web` (6) and
`strict-web-leg-e2e` (5) and aggregate job `strict-web` all **success**; aggregate
log confirms `WEB_RESULT: success` and `E2E_RESULT: success`. Only **swift-packages**
was **skipped**, which is expected when `strict_verify` is true (`if: ... &&
!inputs.strict_verify` in the workflow). No required checks skipped for strict
native or strict web. Parent may mark #5109 ready after evidence review; this note
does not change #5114.

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
