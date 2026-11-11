# macOS parity maintenance loop

Scoped autonomous worker for closing native acceptance gaps and ingesting web
product changes after the frozen baseline. This loop is separate from
`AGENT_LOOP`; never enable both for the same work package.

## Kill switch

| Variable | Meaning |
| --- | --- |
| `MACOS_PARITY_LOOP_ENABLED` | Repo variable. String `"true"` enables the workflow. Default off. |

## Operator commands

Pause (stop launching workers):

```sh
gh variable set MACOS_PARITY_LOOP_ENABLED --body false
```

Resume:

```sh
gh variable set MACOS_PARITY_LOOP_ENABLED --body true
```

Dispatch one task immediately:

```sh
gh workflow run macos-parity-loop.yml -f stable_key=native-go-to-date-announcements
```

Let the hourly watchdog pick the next queued task:

```sh
gh workflow run macos-parity-loop.yml
```

Hard stop while a worker is mid-flight:

1. Set `MACOS_PARITY_LOOP_ENABLED=false`.
2. Remove label `macos-parity-loop-running` from issue #4783 if it is stale.
3. Cancel the Cursor cloud agent from the dashboard if needed.

## Secrets and one-time setup

1. `CURSOR_API_KEY` secret (same Cloud Agents API key as agent-loop).
2. Labels: `macos-parity-loop-running`, `macos-parity-loop-waiting-for-credits`,
   `macos-parity-loop-needs-human`.
3. Parent tracking issue [#4783](https://github.com/KeepSoftwareSimple/compass-calendar/issues/4783).

Do not flip `MACOS_PARITY_LOOP_ENABLED` from this document alone; confirm Tyler
wants the scoped worker active.

## Sources of truth

| Concern | Location |
| --- | --- |
| Frozen baseline behaviors | `docs/acceptance/macos-parity/inventory.json` |
| Incremental merge stream | `docs/acceptance/macos-parity/incremental-stream.json` |
| Durable task queue | `docs/acceptance/macos-parity/maintenance-queue.json` |
| Queue logic and tests | `docs/acceptance/macos-parity/parity_loop.py` |
| Pick / launch / ingest | `.github/scripts/macos-parity-loop-*.sh` |
| Workflow | `.github/workflows/macos-parity-loop.yml` |
| Agent instructions | `.github/prompts/macos-parity-loop.md` |

Leases and quota retry timestamps live on issue #4783 labels and HTML comment
markers, not in checkpoint-only commits on product branches.

## Recovery

- **Stale lease:** the watchdog clears `macos-parity-loop-running` when issue
  #4783 has not updated in three hours.
- **HTTP 429:** launch adds `macos-parity-loop-waiting-for-credits` and a
  `macos-parity-quota-retry-at=` marker; the next eligible hourly run retries.
- **Changed head:** tasks with recorded `evidenceHead` revert to `pending` when
  the head moves (see `parity_loop.py` tests).

## Verify locally

```sh
python3 -B docs/acceptance/macos-parity/parity_loop.py validate
python3 -B -m unittest discover -s docs/acceptance/macos-parity -p '*_test.py'
```
