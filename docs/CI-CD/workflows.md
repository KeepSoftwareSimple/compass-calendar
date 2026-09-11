# Workflows

Compass uses GitHub Actions for continuous integration, Docker Hub for image distribution, and a VPS for staging.

| Workflow | Trigger | Purpose |
|---|---|---|
| Unit (`test-unit.yml`) | Push / PR / merge_group to `main` | Runs `static` (lint, knip, type-check) and unit tests. PRs run only the packages they touched (`packages/core`, root `package.json` / `bun.lock` / `tsconfig*` still turn every leg on). Merge queue and `main` always run every leg. |
| E2E (`test-e2e.yml`) | Push / PR / merge_group to `main` | Playwright e2e in four shards behind one required `e2e` gate (PRs that touch only docs, or only `packages/backend`, `packages/sync`, `packages/scripts`, skip the shards; merge queue and `main` always run them) |
| CodeQL | Push / PR to `main` | Static security analysis |
| Performance budget | Push to `main` (web/core/lock/budget), nightly schedule, `workflow_dispatch`; PR only when `.github/perf/**` or the workflow file changes | Lighthouse budget (not a required merge check). Desktop script transfer is calibrated to 1,060 KB as of 2026-09-07 (main measured 1,034,338 bytes). |
| Error autofix (`error-autofix.yml`) | `posthog[bot]` issue opened/reopened, hourly sweep, `workflow_dispatch` | Governed Routine: triage or fix PostHog error issues; sweep re-enters missed recurrences |
| Error autofix post-deploy (`error-autofix-postdeploy.yml`) | `Release on main` completed | Notifies Discord/GitHub of autofix release outcome |
| Agent review (`agent-review.yml`) | `workflow_dispatch` only (parked). Kill switch `AGENT_REVIEW_ENABLED` still in the job `if:`. Restore `pull_request` types to turn it on. | Independent read-only diff review posted as a PR comment (not a required check) |
| Agent loop (`agent-loop.yml`) | `workflow_dispatch` / hourly cron / `agent-automerge` labeled or merged; `Release on main` smokes only | Governed Routine: next milestone WP → Cursor API → merge-guard → merge queue → staging smoke |
| Release on main | Push to `main` | Auto-increments patch version, publishes Docker images, then deploys staging |
| Publish Docker images | Reusable workflow / manual dispatch / manual `v*.*.*` tag push | Builds and pushes Docker images only |
| Deploy staging | Reusable workflow / manual dispatch | Pulls published images on staging, restarts the stack, then runs deploy health checks |
| Deploy production | Manual dispatch | Deploys a release tag to production, then runs cloud deploy health checks |
| Deploy health check | Reusable workflow | Validates the deployed staging stack and alerts Discord on failure |
| Sync docs to compass-docs | Push to `main` touching `docs/**` | Mirrors this `docs/` directory to docs.compasscalendar.com |
| Live provider smoke (`live-provider-smoke.yml`) | Nightly schedule / `workflow_dispatch` only (never on PRs) | Live adapter contract against `compass-smoke` test calendars; see [live-provider-smoke.md](./live-provider-smoke.md) |

Error autofix is a governed Routine. Contract, drills, and recovery packet:
[error-autofix-routine.md](./error-autofix-routine.md). Kill switch
(`ERROR_AUTOFIX_ENABLED`) and mode (`AUTOFIX_MODE`) stay as repo variables.

Agent loop is a governed Routine. Contract, kill switch, Cursor API
launch, and staging smoke: [agent-loop-routine.md](./agent-loop-routine.md).
Kill switch (`AGENT_LOOP_ENABLED`) stays a repo variable (default off).
Ordered queue: `AGENT_LOOP_MILESTONES` (empty idles). Two launch paths:
hourly/`workflow_dispatch` kick, and `launch-next` on automerge merge.
`post-deploy` smokes only.

---

## Unit workflow

Source: [`.github/workflows/test-unit.yml`](../../.github/workflows/test-unit.yml)

`static` (lint, knip, and type-check as separate steps) and each `unit-leg`
carry a 10-minute job timeout. A rollup `unit` job requires every leg, so
the ruleset needs only `static`, `unit`, and `e2e`; legs can change without
touching branch protection. Unit test-run steps are separately capped
at 5 minutes each, leaving headroom for checkout, setup-bun, cache, and
install. These bound a hung job to a fixed, small window instead of
GitHub's 360-minute default. GitHub Actions has no native way to give
several built-in action steps (`checkout`, `setup-bun`, `cache`) one
shared budget without reimplementing them by hand, so the job-level
timeout is the practical equivalent.

Jobs that only run Bun do not install Node. `unit (web, 1)` and
`unit (web, 2)` each cover half the web suite. CI uses `WEB_TEST_SHARDS=4`
with `WEB_TEST_SHARD_INDEX=1,2` and `3,4` so each leg runs two sequential
processes of about 96 files (a single 191-file process exceeds the 7 GB
runner). Local `bun test:web` still runs every shard sequentially.
`WEB_TEST_SHARDS=2 WEB_TEST_SHARD_INDEX=2 bun test:web` still runs only
the second half.

On pull requests, `detect-code-changes.sh` also emits per-package outputs
(`core`, `web`, `backend`, `sync`, `scripts`). A backend-only PR still
runs `static` and the backend leg, and skips the web runners. Changes
under `packages/core`, or to root `package.json`, `bun.lock`, or
`tsconfig*.json`, turn every leg on. `merge_group` and push to `main`
always run every leg.

**Known flakiness**: a job can occasionally hang for several minutes on
runner/network flakiness unrelated to the diff, while the identical job on
the identical commit in a parallel run passes quickly. If a check looks
stuck well past its normal duration, cancel and rerun just that job rather
than investigating the diff first:

```bash
gh run cancel <run-id>
gh run rerun <run-id> --failed
```

## Release Flow

Every PR merge to `main` triggers a fully automated chain:

```
PR merged to main
  └─► release-on-main.yml
        ├─► tag-release             — reads latest tag, pushes v1.2.X+1
        ├─► publish-docker-images   — builds and pushes Docker Hub images
        └─► deploy-staging          — SSHes into VPS, runs ./compass update
              ├─► staging-cloud deploy health check
              └─► staging-selfhosted deploy health check
```

The automatic path calls reusable workflows directly. It uses `GITHUB_TOKEN` to
push the git tag, then passes that tag to the publish and deploy workflows. It
does not rely on the workflow-created tag push to trigger another workflow.
The release workflow remains blocked until both staging deploy health checks pass.
If a health check fails, the reusable workflow sends one Discord alert for that
environment with the release tag, run URL, failed check names, and redacted
excerpts.

**Monthly minor/major releases** remain manual: a maintainer pushes a tag like
`v1.3.0` or `v2.0.0`, which skips the bump step and runs
`Publish Docker images`. Staging deploys for manual tags are explicit: run
`Deploy staging` with the existing tag after the images are published.

### Removing a test tag

```sh
git push origin --delete v1.2.3
git tag -d v1.2.3
```

---

## Publish Docker Images

Source: [`.github/workflows/publish-docker-images.yml`](../../.github/workflows/publish-docker-images.yml)

### How it works

1. A semver tag is provided by `release-on-main.yml`, by manual workflow dispatch,
   or by a manually pushed tag matching `v[0-9]+.[0-9]+.[0-9]+`.
2. The workflow strips the `v` prefix and derives two tag aliases:
   - `1.2.3` — exact patch version
   - `1.2` — floating minor alias
3. It builds and pushes three images to [our Docker Hub](https://hub.docker.com/repositories/switchbacktech):
   - `switchbacktech/compass-backend`
   - `switchbacktech/compass-mongo`
   - `switchbacktech/compass-web`
4. Each image gets all three tags: `1.2.3`, `1.2`, and `latest`.

Each `docker/build-push-action` step exports a per-image GitHub Actions
cache (`cache-from`/`cache-to` `type=gha,mode=max`). Bun images copy
`package.json`, `bun.lock`, `bunfig.toml`, `patches/`, and workspace
`package.json` files and run `bun install --frozen-lockfile` before
`COPY . .`. Every `oven/bun:` tag must match the `bun-version` in
`.github/workflows/test-unit.yml` (`packages/scripts/src/testing/check-agent-constraints.ts`).

### Tag pattern rules

Only clean semver tags trigger this workflow from a tag push. Tags with suffixes
(e.g. `v1.2.3-test`) do not match and are safe to push for local testing without
publishing images.

---

## Staging Deploy

Source: [`.github/workflows/deploy-staging.yml`](../../.github/workflows/deploy-staging.yml)

The deploy workflow SSHes into the staging VPS and runs `./compass update`,
which pulls the Docker Hub image tag configured by the staging `compass.yaml` file and
restarts the stack. The workflow accepts a release tag input so the Actions logs
show which release triggered or motivated the deploy.

After each staging environment deploy, `deploy-staging.yml` calls
`deploy-health-check.yml`. The health check SSHes into the same host, verifies
`~/compass`, `./compass status`, bounded Docker Compose logs, service health,
expected Docker image tags, frontend HTML, backend `/health`, and data-service
reachability. The `staging-cloud` profile checks the external MongoDB URI. The
`staging-selfhosted` profile additionally checks MongoDB, SuperTokens, and the
expected Docker volumes inside the self-hosted stack.

Manual staging redeploys do not rebuild images. Run `Deploy staging` with an
existing tag after confirming the desired image tags already exist on Docker Hub.

### Required secrets and variables

Secrets and variables are split between repository level (shared across workflows) and the `Staging` GitHub Environment (scoped to the deploy job).

**Repository-level** — GitHub → Settings → Secrets and variables → Actions:

| Name | Value |
|---|---|
| `DOCKERHUB_USERNAME` | Docker Hub username for the `switchbacktech` org |
| `DOCKERHUB_TOKEN` | Docker Hub personal access token (Read & Write) |
| `DISCORD_DEPLOY_WEBHOOK_URL` | Discord webhook for deploy health check failure alerts |

**Staging environments** (`staging-cloud`, `staging-selfhosted`) — GitHub → Settings → Environments:

| Secret | Value |
|---|---|
| `SSH_PRIVATE_KEY` | Private key from the deploy keypair |
| `COMPASS_SYNC_TOKEN` | Token for compass sync |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `MICROSOFT_CLIENT_SECRET` | Entra app client secret |
| `APPLE_SIGNIN_PRIVATE_KEY` | Sign in with Apple `.p8` private key |
| `SYNC_CREDENTIAL_ENCRYPTION_KEY` | 32-byte base64 key for password credentials at rest |
| `MONGO_PASSWORD` | MongoDB compass user password |
| `MONGO_REPLICA_SET_KEY` | MongoDB replica set key (`staging-selfhosted`) |
| `MONGO_URI` | Backend MongoDB URI |
| `SUPERTOKENS_KEY` | SuperTokens API key |
| `SUPERTOKENS_POSTGRES_PASSWORD` | SuperTokens PostgreSQL password (`staging-selfhosted`) |
| `SUPERTOKENS_URI` | SuperTokens connection URI |
| `SYNC_INTERNAL_AUTH_TOKEN` | Shared secret between backend and Sync (required) |
| `SYNC_MONGO_URI` | Isolated Sync MongoDB URI (`staging-cloud` / production; selfhosted derives this from `MONGO_PASSWORD`) |

| Variable | Value |
|---|---|
| `SSH_HOST` | VPS IP address or hostname |
| `SSH_USER` | Linux user on the VPS that owns `~/compass` |
| `BACKEND_API_URL` | Staging backend API URL |
| `FRONTEND_URL` | Staging frontend URL |
| `GOOGLE_CLIENT_ID` | OAuth client ID |
| `MICROSOFT_CLIENT_ID` | Entra app client ID |
| `APPLE_SIGNIN_SERVICES_ID` | Sign in with Apple Services ID |
| `APPLE_SIGNIN_TEAM_ID` | Apple Developer team ID |
| `APPLE_SIGNIN_KEY_ID` | Sign in with Apple key ID |
| `COMPOSE_PROFILES` | Compose profiles (`selfhosted` on `staging-selfhosted`; sync is always appended by the deploy) |

---

## Production Deploy

Source: [`.github/workflows/deploy-production.yml`](../../.github/workflows/deploy-production.yml)

Production deploys are manual-only. Run `Deploy production` from GitHub Actions
with an existing release tag, such as `v1.2.3`; it is not called by
`release-on-main.yml` and does not run automatically after PR merges.

The workflow deploys to the GitHub `production` environment through
`_deploy-environment.yml`, builds an environment-specific web image tagged
`switchbacktech/compass-web:production-<version>`, then runs
`deploy-health-check.yml` with the `cloud` profile. Production is expected to use
external MongoDB and SuperTokens Cloud rather than self-hosted data services.

For cloud web image builds, `_deploy-environment.yml` uses
`.github/docker/Dockerfile.web` so frontend-only cloud config, such as PostHog,
is baked into the bundle without adding cloud-only settings to the self-host
Dockerfile.
