# Compass

## Defaults

- Frontend-only work usually starts with `bun dev:web`; it does not require
  backend services.
- Backend, auth, MongoDB, Google sync, and SSE work require
  a `compass.yaml` at the repo root. Bootstrap with:

```bash
cp compass.example.yaml compass.yaml
```

- `compass.yaml` contains secrets. Do not commit it.

- Avoid defaulting to `bun test`; use the focused package test first.
- Formatting is handled by repo-local Codex and Cursor hooks after agent edits.
- Use `bun lint` and relevant verification before pushing or ending a session.

## Commands

```bash
bun install
bun dev:web
bun dev:backend
bun dev:sync
bun test:core
bun test:sync
bun test:web
bun test:backend
bun test:scripts
bun type-check
bun lint
bun lint:fix
```

Validation defaults:

- Core: `bun test:core`
- Sync: `bun test:sync`
- Web: `bun test:web`
- Backend: `bun test:backend`
- Scripts: `bun test:scripts`
- Shared contracts/cross-package behavior: affected package tests plus
  `bun type-check`
- Keep regression tests that protect real behavior. Remove temporary tests,
  scripts, debug hooks, or code added only to confirm a one-time hypothesis once
  that verification is complete.
- Use `bun run verify` when you want the repo helper to choose checks from the
  git diff, but confirm its output before treating the task as done.
- Use `bun run lint` before pushing when the work is not docs-only.

## Lookups

- Docs index: `docs/README.md`

## Skills

Project workflows live in `.agents/skills` so supported agents share one source
of truth:

- `/ship`: validate, review, open, merge, and verify a delivery
- `/simplify`: reduce complexity without changing behavior
- `/a11y-audit`: review changed UI for accessibility regressions
- `/qa-test-staging`: run the post-deploy staging confidence sweep
- `/verify-change`: select and run checks from the actual diff
- `/local-dev-bootstrap`: prepare the lightest viable local environment
- `/google-sync-debug`: trace OAuth, provider, job, webhook, and SSE failures
- `/handoff`: compact work for a fresh agent session

## Compass-Specific Rules

- Use aliases instead of deep relative imports:
  - `@compass/backend` -> `packages/backend/src`
  - `@compass/core` -> `packages/core/src`
  - `@compass/scripts` -> `packages/scripts/src`
  - `@compass/sync` -> `packages/sync/src`
  - `@web/*` -> `packages/web/src/*`
  - `@core/*` -> `packages/core/src/*`
- Shared web/backend contracts belong in `packages/core` and should use Zod.
- Web tests should use React Testing Library, semantic role/name/text queries,
  and `user-event`; avoid CSS selectors and `data-*` locators.
- New web styles should use Tailwind semantic colors from
  `packages/web/src/index.css`, not raw colors like `bg-blue-300`.
- Prefer canonical Tailwind scale utilities over arbitrary values when an
  equivalent exists. Treat VS Code Tailwind IntelliSense
  `suggestCanonicalClasses` warnings as actionable cleanup before finishing
  changes.
- Do not test login flows without the required backend setup.
- Keep React components in their own files.
- Do not add or use barrel files such as `index.ts` / `index.tsx`. Import from
  the concrete source file instead, and remove nearby barrel files when it is
  safe to do so.

## Git

- Branches: `type/action[-issue-number]`, for example `feature/add-form`.
- Commits: conventional, lower-case, present tense, for example
  `fix(web): handle disconnected google state`.

## Claude Code worktree specific instructions

At the start of any session in a fresh worktree — before assuming a
`type-check`/`dev:*` failure reflects a real code problem — read and follow
`.agents/skills/local-dev-bootstrap/SKILL.md` directly (it is not invocable
as a `/local-dev-bootstrap` slash command; `.agents/skills/*` isn't
registered with the Skill tool). It covers, in order: installing
dependencies unconditionally first (a fresh worktree with no `node_modules`
makes `type-check` fail with dozens of misleading `Cannot find module`
errors), trusting the port `dev:ports` actually prints rather than
`.claude/launch.json`'s declared 9080/3000, and how `dev:ports` fills in a
missing `sync:` block on its own once `mongo.uri` is present — no manual
config authoring or asking the user for values needed.

## Cursor Cloud specific instructions

Bun (`bun@1.3.14`) is the runtime and package manager. The environment is
defined in `.cursor/environment.json`: its `install` step installs Bun (fresh
VMs do not ship it) and runs `bun install`, so Bun is guaranteed on boot. The
VM's system `node` may be older than the `engines` field asks for, but
everything runs through Bun, so that mismatch is not a blocker.

- `compass.yaml` at the repo root is required for `dev:web`, `dev:backend`, and
  `cli` — even frontend-only `dev:web` aborts if the config still contains
  placeholders. The validator (`packages/core/src/config/compass.config.ts`)
  rejects any string containing `REPLACE_WITH_` (comments are ignored). This
  file is gitignored and holds secrets — never commit it.
- Web: `bun run dev:web` serves http://localhost:9080 and works fully in the
  anonymous / IndexedDB mode with no backend (create/edit events, shortcuts,
  etc.), which is the quickest way to exercise core functionality. For
  frontend-only work, `cp compass.example.yaml compass.yaml` and replace the
  placeholders with any dummy non-placeholder strings.
- Tests need no external services — the DB-backed suites (`test:backend`,
  `test:sync`, `test:scripts`) spin up an in-memory MongoDB automatically, and
  SuperTokens/Google are mocked. Run the focused suite per AGENTS.md
  (`bun test:core|web|backend|sync|scripts`).
- Playwright e2e/a11y (`bun test:e2e`, `bun test:a11y`) are self-contained —
  they boot their own web server on port 9150 with `e2e/compass.playwright.yaml`
  (no real backend), but require the browser first: `bunx playwright install
  chromium`. Axe "incomplete" results are logged, not failures (see
  `docs/development/testing-playbook.md`).
- Backend: run `bash .cursor/bootstrap-backend.sh` once to write a working
  `compass.yaml` and install/start a single-node MongoDB replica set, then
  `bun run dev:backend` (serves http://localhost:3000/api). The script is
  idempotent and reads `SUPERTOKENS_URI`, `SUPERTOKENS_KEY`, `GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `SYNC_MONGO_URI`, and `SYNC_INTERNAL_AUTH_TOKEN` from
  the environment when set (otherwise dummy local values, Google disabled). The
  required `sync.*` config block is filled with local defaults — `sync.mongoUri`
  points at an isolated `compass_sync` database on the same local replica set.
  Non-obvious: the backend uses transactions, so Mongo must be a replica set and
  both `mongo.uri` and `sync.mongoUri` must include `replicaSet=...` — a
  standalone `mongod` will not work. `GET /api/health` returning
  `200 {"status":"ok"}` confirms the backend is up and Mongo is reachable.
- The Sync service (`bun run dev:sync`) is a separate, optional process. When it
  is not running, the backend logs recurring
  `app:sse.sync-change-feed: Sync global change-feed poll failed: unavailable`
  warnings — these are expected and harmless for core event CRUD work; only start
  `dev:sync` when working on Google sync/SSE.
- Auth/login and real Google Calendar sync are gated on external services not
  provisioned by default: a SuperTokens instance and Google OAuth. Provide them
  as environment secrets so `bootstrap-backend.sh` wires them into
  `compass.yaml`. Without them the backend still runs and serves
  anonymous/health traffic, but do not attempt login flows (see the AGENTS.md
  rule) until those are configured.
- GitHub merge (`/ship` squash-merge) is a permission on the **GitHub MCP**
  identity, not the sandbox `gh` CLI. `gh` uses a read-only Cursor GitHub App
  token (`ghs_…`, account `cursor`) and returns `403 Resource not accessible
  by integration` for writes. Squash-merge uses GitHub MCP
  `merge_pull_request`, which authenticates as the connected user. That token
  must have **Contents: Read and write** and **Pull requests: Read and write**
  on `KeepSoftwareSimple/compass-calendar`. `403 Resource not accessible by
  personal access token` on merge means Contents write is missing — do not
  treat that as a successful ship. Grant Contents write on the GitHub MCP /
  Cursor GitHub connection, and add a fine-grained PAT with those same
  permissions as `GH_TOKEN` on the `ccal` cloud environment
  (https://cursor.com/dashboard/cloud-agents/environments/e/a8d6d701-95d6-11f1-ba66-0e7d0216e441).
  New agent runs pick up the secret; the current session will not.
