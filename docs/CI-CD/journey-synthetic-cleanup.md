# Journey synthetic cleanup (manual)

Workflow: [`.github/workflows/journey-synthetic-cleanup.yml`](../../.github/workflows/journey-synthetic-cleanup.yml).

Tyler-approved manual deletion for synthetic journey leftover accounts only. The job **hard-refuses** any email that does not match the allowed pattern before Compass or Stripe actions run.

## Workflow inputs

| Input | Description |
|---|---|
| `environment` | `staging` or `production` (selects `staging-journey` vs `prod-journey` GitHub Environment) |
| `emails` | Comma-separated addresses (optional when `discover_pending_file` is true) |
| `dry_run` | Default `true`: log planned Compass and Stripe actions only |
| `discover_pending_file` | When true, read `e2e/test-results/*/journey-pending-account.json` for one email |

Production emails must match `^lance\.essert\+prod-journey-[a-z]+\+journey\d+@gmail\.com$`. Staging accepts `^lance\.essert\+journey\d+@gmail\.com$` only.

## Secrets

Uses the same journey environments as prod/staging journey legs, plus `STRIPE_SECRET_KEY` when Stripe cleanup is planned.

When `bootstrap_staging_probe_account` is true, the workflow signs up one staging account and writes `journey-pending-account.json` (via `STAGING_JOURNEY_CLEANUP_BOOTSTRAP=1`, not the artifact probe).

## Local CLI

```bash
bun run cli journey-synthetic-cleanup \
  --environment staging \
  --emails 'lance.essert+journey1730123456789@gmail.com'
```

Add `--apply --stripe-only` after Playwright UI cleanup, or use the workflow script.
