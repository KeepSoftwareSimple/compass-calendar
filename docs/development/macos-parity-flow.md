# Autonomous macOS acceptance flow

Owner: parent issue [#4783](https://github.com/KeepSoftwareSimple/compass-calendar/issues/4783).
The frozen scope is the web UI/E2E source inventory at the commit recorded in
[the inventory](../acceptance/macos-parity/inventory.json), plus native signed-build
checks in [desktop acceptance](../acceptance/desktop.md). Future automatic web
change propagation is deferred. Adding future work does not silently alter this baseline.

Run from repository root:

```sh
python3 -B docs/acceptance/macos-parity/audit.py check
python3 -B docs/acceptance/macos-parity/audit.py report
python3 -B docs/acceptance/macos-parity/audit.py gate
python3 -B -m unittest discover -s docs/acceptance/macos-parity -p '*_test.py'
```

`check` validates accounting; `gate` exits unsuccessfully until acceptance is complete.
A file inventory is only a discovery queue. For each source, read every test and
parameterized case, extract observable behaviors, and add stable behavior IDs with
web test names/line anchors, native test methods, equivalence review, status and evidence.
Only mark a source reviewed after all of its behaviors are mapped or explicitly
excluded. Multiple behaviors per source and multiple sources per behavior are expected.
Exclude only after recording the platform-specific reason and review. No native
counterpart is `missing`; an uninspected counterpart is `unreviewed`; observed
failure is `failing`. Never infer equivalence from filenames or matching test counts.
`passing` requires matching assertions and inspected successful run evidence.
Fixture/model tests can prove those assertions, not real signed-in behavior.

## Each unattended wake

1. Read AGENTS.md, this runbook and [checkpoint](../acceptance/macos-parity/checkpoint.md).
   Check account usage before work and before dispatching a long operation. Check
   existing PR/queue activity first, avoiding duplicate fixes and CI dispatches.
2. Run the report. Prioritize confirmed failures, missing core event behavior,
   incomplete keyboard sequences, then source review. Skip externally blocked work
   while continuing independent items. Do not repeatedly ask for the same authorization.
3. Read the next source and its native assertions. Split its behaviors, record
   omissions, implement the smallest meaningful regression and fix. Never weaken
   assertions, widen timeouts or change test order to get green. Native UI XCTest
   runs only on isolated GitHub Macs because of the Brave interruption-query crash.
4. Use the ship skill. Inspect downloaded strict native AND web verdict logs at the
   exact PR head, including required checks and skips; inspect failures and artifacts
   before retrying. Full diff review precedes ready/agent-automerge/auto-merge via
   the merge queue. No long CI waits after pushing. Keep pending run IDs in checkpoint.
5. Update evidence and checkpoint after each work package, before stopping and before
   usage reaches 80% in either window. Checkpoint sooner for a long task. Record
   dirty paths, branch/head, pending CI, exact next command, unresolved gates, usage
   and UTC reset times. Commit reviewed work; leave incomplete changes explicitly
   described. Never reset another worktree or edit a merged branch.
6. When ordinary usage is unavailable or either window reaches 80%, finish the
   checkpoint and defer further work. Calculate the next eligible time from the
   exhausted/threshold windows' reset timestamps. Leave the existing 30-minute
   heartbeat ACTIVE as the fallback. After reset, the next eligible wake reads
   this checkpoint and continues without a human prompt. Never redeem reset credits.

## Independent completion gates

All baseline sources must have a complete assertion review and every behavior must
be passing or have a reviewed exclusion. No missing/failing/unreviewed work remains.
In addition, all four inventory gates must have dated, build-specific evidence:

- **Visual:** actually inspect native/web captures for all relevant surfaces in both
  themes, including date/time owned popovers, focus, window corners and Dock artwork.
  Record inspected artifacts, reviewer, builds and accepted platform differences.
  Pixel/fixture success and screenshot generation alone do not pass visual review.
- **Signed-in:** signed/notarized installed native build, known authorized test account,
  real create/edit/reload persistence, real RSVP submission and reload, safe cleanup
  of owned records, and every desktop signed-build check (or reviewed exclusion).
  Record version/build, host, steps and result. Web staging and demo fixtures do not
  pass this gate. Keep #4783 open until native acceptance is evidenced.
- **Strict:** downloaded native and web logs show PASS with no required checks skipped
  for the candidate head. Record head, run and artifact references. A workflow badge
  or a passing prior head does not meet this requirement.
- **Full review:** complete base-to-head review, no unresolved actionable findings,
  merged changes through queue, and acceptance evidence tied to the final build.

Only then may `audit.py gate` report PASS and the heartbeat stop. The checker checks
record completeness, not truth: the agent must inspect assertions, logs and images.
Never report full parity on the strength of accounting alone.

## Scheduling and boundaries

Existing automation ID: `continue-macos-parity-overnight`, current chat
`01a18a4c-acd8-7791-9819-4f87caa8c156`. Update it in place using automation tools,
then read back its saved configuration. Retain the 30-minute recurring fallback;
do not replace it with a one-shot or create duplicates. The tool supports chat
heartbeats and minute recurrence. It does not expose a guaranteed rate-limit-reset
trigger. Recorded reset timestamps plus recurring retries provide recovery on the
next eligible wake, not a promise to execute while limited. Local work requires
computer powered on and app running, as documented in
[official scheduling documentation](https://learn.chatgpt.com/docs/automations).

No local automated desktop takeover, unlocking, user-dialog dismissal, security
changes, credential inspection, OAuth or CUA bypass. Escalate only concrete blocked
acceptance requiring human action; continue independent backlog work. Notify only
meaningful progress, failure, completion or needed decisions; unchanged wakes stay quiet.
