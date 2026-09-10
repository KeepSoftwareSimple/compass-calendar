# Versioning

Compass uses two complementary version identifiers.

## Semver tag (git)

Format: `v{MAJOR}.{MINOR}.{PATCH}` — e.g. `v0.5.4`

- Bumped automatically on every merge to `main` (patch) by `release-on-main.yml`
- Minor/major bumps are manual: push a tag like `v0.6.0` directly
- Used to tag Docker images on Docker Hub (`switchbacktech/compass-web:0.5.4`, `:0.5`, `:latest`)

## BUILD_VERSION (frontend runtime)

A string baked into the web bundle at build time by `packages/web/build.ts` and written to `build/web/version.json`. Used by `useVersionCheck` to detect when a newer deployment is available, and displayed in the command palette under **More → Version**.

## Backend and Sync runtime version

`compass.yaml` `runtime.version` (and the `VERSION` env var in containers) is
normalized by `normalizeDeployVersion` in `@core/util/deploy-version.util` and
exposed as:

- `GET /api/config` → `version` (validated by `AppConfigSchema`)
- Sync `GET /health/ready` → `version` (same string as the API)
- PostHog `$exception` custom property `version` on backend and sync

Deploy health checks compare the release tag to both `version.json` and
`/api/config` after each release.

| Build context | Value |
|---|---|
| Tagged CI release | Semver without `v` — e.g. `0.5.4` (from `COMPASS_BUILD_REF`) |
| Local dev (git available) | Short git SHA — e.g. `a1b2c3d` |
| Self-hosted (no env set) | `{timestamp}-self-host` |

### How it flows in CI

1. `release-on-main.yml` pushes `v0.5.4` from its `tag-release` job.
2. `release-on-main.yml` calls `publish-docker-images.yml` with `tag=v0.5.4`.
3. `publish-docker-images.yml` sets `COMPASS_BUILD_REF=0.5.4` as a Docker build arg.
4. `build.ts` reads `COMPASS_BUILD_REF`, sets `BUILD_VERSION = "0.5.4"`.
5. Bundle and `version.json` both contain `"0.5.4"`.
6. `release-on-main.yml` calls `deploy-staging.yml` after Docker publishing succeeds.

### Adding a new build context

To inject a custom version (e.g. a self-hosted build with a known tag):

```sh
COMPASS_BUILD_REF=my-version bun run build
```

The `"self-host"` fallback (with timestamp prefix) is only used when git is unavailable **and** `COMPASS_BUILD_REF` is not set.
