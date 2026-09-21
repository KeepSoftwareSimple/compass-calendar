# CLI

Compass has a CLI to help devs run a few scripts locally.

```bash
bun run cli --help
```

Primary file:

- `packages/scripts/src/cli.ts`

## Commands To Know

| Command | Implementation | Notes |
| --- | --- | --- |
| `bun run cli purge-user --email <address> [--apply] [--out report.json]` | `packages/scripts/src/commands/purge-user.ts` | Deletes one user's API, Sync, and SuperTokens data. Defaults to dry-run. |
| `bun run cli backfill-billing [--apply] [--batch-size 500] [--cutoff ISO]` | `packages/scripts/src/commands/backfill-billing.ts` | Places existing accounts without billing status into awaiting_checkout. Defaults to dry-run. |
| `bun run cli backfill-identities [--apply] [--batch-size 500]` | `packages/scripts/src/commands/backfill-identities.ts` | Copies `google.googleId` into `identities[]` for users that still only have the legacy Google slot. Defaults to dry-run. Staging and production runs are a founder task. |
| `bun run cli purge-corrupt-sync-events [--apply]` | `packages/scripts/src/commands/purge-corrupt-sync-events.ts` | Deletes invalid Sync event documents. Defaults to dry-run. |
| `bun run cli refresh-connection-states [--apply]` | `packages/scripts/src/commands/refresh-connection-states.ts` | Re-derives Sync connection state. Defaults to dry-run. |
| `bun run cli encrypt-credentials [--apply] [--batch-size 200]` | `packages/scripts/src/commands/encrypt-credentials.ts` | Encrypts legacy plaintext OAuth refresh tokens in Sync credentials. Defaults to dry-run. |
| `bun run cli manage-failed-jobs <list\|clear\|requeue> …` | `packages/scripts/src/commands/manage-failed-jobs.ts` | Operator tooling for Sync jobs that exhausted the self-heal requeue budget. Defaults to dry-run; pass `--apply` to persist. |

### Encrypt OAuth refresh tokens at rest

Requires `SYNC_MONGO_URI` or `sync.mongoUri`, and `SYNC_CREDENTIAL_ENCRYPTION_KEY` or `sync.credentialEncryptionKey`.

```bash
export SYNC_MONGO_URI='…'
export SYNC_CREDENTIAL_ENCRYPTION_KEY='…'

# Inventory plaintext rows (JSON to stdout)
bun run cli encrypt-credentials

# Write encrypted rows
bun run cli encrypt-credentials --apply
```

Run on staging, confirm the report shows zero matched rows, then run on production before deploying a sync release that rejects plaintext OAuth rows at startup.

#### Key rotation (procedure only)

Each encrypted field carries a `keyVersion` (currently `1`). Rotating `sync.credentialEncryptionKey` is not automated in v1: decrypt with the old key and re-seal with the new key under a higher version, then deploy the new key. Implementing rotation tooling is deferred.

### Manage exhausted Sync jobs

Requires `SYNC_MONGO_URI` or `sync.mongoUri` in `compass.yaml` pointed at the
isolated Sync Mongo database.

```bash
export SYNC_MONGO_URI='…'

# Inventory exhausted jobs (JSON to stdout)
bun run cli manage-failed-jobs list

# Clear a stuck failed job so a new enqueue can take its coalescing key
bun run cli manage-failed-jobs clear \
  --id <SyncJobId> \
  --coalescing-key <key> \
  --apply

# Or force another full retry ladder on the same job id
bun run cli manage-failed-jobs requeue --id <SyncJobId> --apply
```

Prefer dry-run (omit `--apply`) before writing. Clear is the usual unblock when
the underlying condition is durable (for example Google `notACalendarUser`);
also fix or disconnect the Google account so daily calendar-list rediscovery
does not recreate the same ladder. The self-heal sweep also auto-clears
exhausted jobs whose connection already has a durable `lastReadFailureAt`
marker, so operator clear is mainly for exhausted rows without that marker.

## Sync Database Backup / Restore

These scripts are **not** registered on `bun run cli`. They dump/restore only
the isolated Sync Mongo database (`sync.mongoUri` / `SYNC_MONGO_URI`), never
the Compass API database. Requires MongoDB Database Tools on `PATH`.

```bash
bun packages/scripts/src/commands/sync-backup.ts [--out DIR]
bun packages/scripts/src/commands/sync-restore.ts --from DIR [--drop]
```

Use `--drop` only against a throwaway Sync database during a restore drill.

## Historical Migrations

The server-side migration runner and completed Sync cutover tools were removed.
Current releases do not ship pending database migrations. An installation that
still needs the sub-calendar v1 cutover must use the documented historical
`v1.0.310` stepping-stone release. Browser-local migrations remain under
`packages/web/src/common/storage/migrations`.
