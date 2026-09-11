import { afterEach, describe, expect, it } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), { encoding: "utf8" });
}

async function runHealthScript(
  args: string[],
  env: Record<string, string> = {},
) {
  const reportDir = makeTempDir();
  const proc = Bun.spawn(
    ["bash", join(repoRoot, ".github/scripts/deploy-health-check.sh"), ...args],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        HEALTH_CHECK_REPORT_FILE: join(reportDir, "report.txt"),
        ...env,
      },
      stderr: "pipe",
      stdout: "pipe",
    },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stderr, stdout };
}

async function runHealthScriptFunction(
  command: string,
  env: Record<string, string> = {},
) {
  const proc = Bun.spawn(
    ["bash", "-c", `. .github/scripts/deploy-health-check.sh; ${command}`],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...env,
      },
      stderr: "pipe",
      stdout: "pipe",
    },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stderr, stdout };
}

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), "compass-health-check-"));
  tempDirs.push(dir);
  return dir;
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("self-host docker compose", () => {
  it("builds the backend image without build-time Compass config", () => {
    const dockerfile = readRepoFile("self-host/Dockerfile.backend");

    expect(dockerfile).toContain("RUN bun run build:backend");
    expect(dockerfile).not.toContain("--environment");
  });

  it("keeps PostHog out of the self-host web image", () => {
    const dockerfile = readRepoFile("self-host/Dockerfile.web");

    expect(dockerfile).not.toContain("COMPASS_WEB_BUILD_CONFIG_B64");
    expect(dockerfile).not.toContain("POSTHOG_");
    expect(dockerfile).not.toContain("posthog:");
  });

  it("mounts compass.yaml into the backend container", () => {
    const compose = readFileSync(join(import.meta.dir, "compose.yaml"), {
      encoding: "utf8",
    });

    expect(compose).toContain("COMPASS_CONFIG_FILE: /app/compass.yaml");
    expect(compose).toContain(
      "- $".concat(
        "{COMPASS_CONFIG_FILE:-./compass.yaml}:/app/compass.yaml:ro",
      ),
    );
  });

  it("builds the sync image without build-time Compass config", () => {
    const dockerfile = readRepoFile("self-host/Dockerfile.sync");

    expect(dockerfile).toContain("RUN bun run build:sync");
    expect(dockerfile).not.toContain("--environment");
  });

  it("installs bun deps before copying the full source tree", () => {
    for (const file of [
      "self-host/Dockerfile.backend",
      "self-host/Dockerfile.sync",
      "self-host/Dockerfile.web",
      ".github/docker/Dockerfile.web",
    ]) {
      const dockerfile = readRepoFile(file);
      const installAt = dockerfile.search(
        /^RUN bun install --frozen-lockfile$/m,
      );
      const copySourceAt = dockerfile.search(/^COPY \. \.$/m);
      expect(installAt).toBeGreaterThan(-1);
      expect(copySourceAt).toBeGreaterThan(installAt);
    }
  });

  it("caches each publish-docker-images build with a per-image GHA scope", () => {
    const workflow = readRepoFile(
      ".github/workflows/publish-docker-images.yml",
    );

    for (const image of ["backend", "sync", "mongo", "web"]) {
      expect(workflow).toContain(`cache-from: type=gha,scope=compass-${image}`);
      expect(workflow).toContain(
        `cache-to: type=gha,mode=max,scope=compass-${image}`,
      );
    }
  });

  it("gates the passive sync service behind its own profile", () => {
    const compose = readFileSync(join(import.meta.dir, "compose.yaml"), {
      encoding: "utf8",
    });

    expect(compose).toContain("switchbacktech/compass-sync:");
    // Sync must be ready to reach storage before a deploy is healthy.
    expect(compose).toContain("http://127.0.0.1:3010/health/ready");
    // "  sync:\n" (colon-then-newline) picks the services.sync: block, not
    // the earlier "  sync: &sync-port ..." x-local-bindings anchor line.
    const syncBlock = compose
      .slice(compose.indexOf("  sync:\n"))
      .split(/\n {2}\w/)[0];
    // The `sync` profile lets a deploy start the container only where an
    // isolated sync database is provisioned.
    expect(syncBlock).toContain("profiles: [sync]");
    // Loopback-only publish so host Caddy can proxy `/sync/*` OAuth/webhooks,
    // port configurable like the web/backend bindings.
    expect(syncBlock).toContain("*sync-port");
    expect(compose).toContain(
      'sync: &sync-port "127.0.0.1:'.concat("$", '{SYNC_PORT:-3010}:3010"'),
    );
    // The read-only root fs needs a writable mount for the logger's log file,
    // or the container crashes on startup.
    expect(syncBlock).toContain("compass_sync_logs:/app/logs");
    expect(compose).toContain("compass_sync_logs:");
  });

  it("omits the backend mongo dependency from the base compose file", () => {
    const compose = readFileSync(join(import.meta.dir, "compose.yaml"), {
      encoding: "utf8",
    });

    // mongo is gated behind the `selfhosted` profile, so a profile-less
    // cloud/Atlas deploy has no mongo container. A hard depends_on in the base
    // file makes that project invalid ("depends on undefined service mongo").
    // `required: false` is the wrong fix: Compose treats an unhealthy optional
    // dependency as satisfied and starts backend before mongo is ready.
    // Match the top-level service definition ("\n  backend:\n", exactly two
    // spaces of indent), not the x-local-bindings anchor ("  backend:
    // &backend-port ...") nor the web service's nested "depends_on: backend:".
    const backendBlock = compose
      .slice(compose.indexOf("\n  backend:\n") + 1)
      .split(/\n {2}\w/)[0];
    expect(backendBlock).not.toContain("mongo:");
    expect(backendBlock).toContain("start_period: 90s");
    expect(compose).toContain("stop_grace_period: 30s");
  });

  it("waits for mongo before starting backend and sync via the selfhosted overlay", () => {
    const overlay = readFileSync(
      join(import.meta.dir, "compose.selfhosted.yaml"),
      { encoding: "utf8" },
    );

    expect(overlay).toContain("depends_on:");
    expect(overlay).toContain("mongo:");
    expect(overlay).toContain("condition: service_healthy");
    expect(overlay).not.toContain("required: false");
    expect(overlay).toContain("  sync:\n    depends_on:");
  });
});

describe("self-host installer", () => {
  it("writes runnable local URLs in the generated compass config", () => {
    const installer = readRepoFile("self-host/install.sh");

    expect(installer).toContain("url: http://localhost:$WEB_PORT_VALUE");
    expect(installer).toContain("apiUrl: http://localhost:$PORT_VALUE/api");
    expect(installer).not.toContain("url: REPLACE_WITH_YOUR_WEB_URL");
    expect(installer).not.toContain("apiUrl: REPLACE_WITH_YOUR_API_URL");
    expect(installer).not.toContain("- REPLACE_WITH_YOUR_WEB_URL");
  });

  it("stops before generating new secrets when existing Docker volumes have no config", () => {
    const installer = readRepoFile("self-host/install.sh");

    expect(installer).toContain("check_missing_config_with_existing_volumes");
    expect(installer).toContain("docker volume inspect");
    expect(installer).toContain(
      "I found existing Compass Docker data, but $CONFIG_FILE is missing.",
    );
  });

  it("downloads the selfhosted mongo overlay with the base compose file", () => {
    const installer = readRepoFile("self-host/install.sh");
    const manual = readRepoFile("self-host/install-manual.sh");

    expect(installer).toContain("self-host/compose.selfhosted.yaml");
    expect(manual).toContain("self-host/compose.selfhosted.yaml");
  });

  it("writes a sync: block wired for sync-by-default, both installers", () => {
    const installer = readRepoFile("self-host/install.sh");
    const manual = readRepoFile("self-host/install-manual.sh");

    for (const script of [installer, manual]) {
      expect(script).toContain("sync:");
      expect(script).toContain(
        "mongo:27017/compass_sync?authSource=admin&replicaSet=rs0",
      );
      expect(script).toContain("execution: active");
      expect(script).toContain("serviceUrl: http://sync:3010");
    }
  });

  it("generates a sync internal auth token as a real secret, not a placeholder", () => {
    const installer = readRepoFile("self-host/install.sh");
    const manual = readRepoFile("self-host/install-manual.sh");

    expect(installer).toContain('generate_secret "Sync internal auth token"');
    expect(installer).toContain("internalAuthToken: $sync_internal_auth_token");
    expect(installer).toContain(
      'generate_base64_key "Sync credential encryption key"',
    );
    expect(installer).toContain(
      'credentialEncryptionKey: "$credential_encryption_key"',
    );
    expect(manual).toContain("SYNC_INTERNAL_AUTH_TOKEN=$(random_hex)");
    expect(manual).toContain("internalAuthToken: $SYNC_INTERNAL_AUTH_TOKEN");
    expect(manual).toContain(
      'credentialEncryptionKey: "$CREDENTIAL_ENCRYPTION_KEY"',
    );
  });

  it("uses the shared config helper in every self-host entry point", () => {
    const helper = readRepoFile("self-host/compass");
    const installer = readRepoFile("self-host/install.sh");
    const manual = readRepoFile("self-host/install-manual.sh");

    expect(readRepoFile("self-host/config.sh")).toContain("default_profiles()");
    expect(helper).toContain("CONFIG_HELPER_FILE=$INSTALL_DIR/config.sh");
    expect(helper).toContain('. "$CONFIG_HELPER_FILE"');
    expect(installer).toContain("download_config_helper");
    expect(installer).toContain('. "$CONFIG_HELPER_FILE"');
    expect(manual).toContain("CONFIG_HELPER_FILE=$COMPASS_HOME/config.sh");
    expect(manual).toContain('. "$CONFIG_HELPER_FILE"');
    expect(manual).toContain("download_atomically");
    expect(manual.indexOf('config.sh" "$CONFIG_HELPER_FILE')).toBeLessThan(
      manual.indexOf('compass" "$HELPER_FILE'),
    );

    for (const source of [helper, installer, manual]) {
      expect(source).not.toMatch(/^read_config_value\(\)/m);
      expect(source).not.toMatch(/^strip_quotes\(\)/m);
      expect(source).not.toMatch(/^default_profiles\(\)/m);
    }

    expect(installer).toContain(
      'COMPOSE_PROFILES="' + "$" + '{COMPOSE_PROFILES-$(default_profiles)}"',
    );
    expect(manual).toContain(
      'COMPOSE_PROFILES="' + "$" + '{COMPOSE_PROFILES-$(default_profiles)}"',
    );

    const deploy = readRepoFile(".github/workflows/_deploy-environment.yml");
    expect(deploy).toContain("self-host/config.sh");
    expect(deploy.indexOf("self-host/config.sh")).toBeLessThan(
      deploy.lastIndexOf("self-host/compass"),
    );
  });

  it("keeps an existing config helper when the manual install download fails", async () => {
    const manual = readRepoFile("self-host/install-manual.sh");
    const functionMatch = manual.match(/^download_atomically\(\)[\s\S]*?^}/m);
    if (!functionMatch)
      throw new Error("missing manual atomic download helper");

    const dir = makeTempDir();
    const helperPath = join(dir, "config.sh");
    const fakeBin = join(dir, "bin");
    const functionPath = join(dir, "download.sh");
    writeFileSync(helperPath, "working helper\n", { encoding: "utf8" });
    mkdirSync(fakeBin);
    const fakeCurl = join(fakeBin, "curl");
    writeFileSync(fakeCurl, '#!/bin/sh\nprintf partial > "$4"\nexit 1\n');
    chmodSync(fakeCurl, 0o755);
    writeFileSync(functionPath, `${functionMatch[0]}\n`, { encoding: "utf8" });

    const proc = Bun.spawn(
      [
        "sh",
        "-c",
        '. "$1"; download_atomically test "$2"',
        "--",
        functionPath,
        helperPath,
      ],
      {
        cwd: repoRoot,
        env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` },
        stderr: "pipe",
        stdout: "pipe",
      },
    );
    expect(await proc.exited).toBe(1);
    expect(readFileSync(helperPath, { encoding: "utf8" })).toBe(
      "working helper\n",
    );
  });
});

// Run the helper's profile derivation against a throwaway config. Sourcing just
// the pure functions keeps this a behavior test rather than a string match, so
// it fails if the derivation regresses instead of only if the source is retyped.
async function runDefaultProfiles(configYaml: string) {
  const dir = makeTempDir();
  const configPath = join(dir, "compass.yaml");
  writeFileSync(configPath, `${configYaml}\n`, { encoding: "utf8" });

  const proc = Bun.spawn(
    [
      "sh",
      "-c",
      `CONFIG_FILE="$1"; . "$2"; default_profiles`,
      "--",
      configPath,
      join(repoRoot, "self-host/config.sh"),
    ],
    { cwd: repoRoot, stderr: "pipe", stdout: "pipe" },
  );

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stderr, stdout: stdout.trim() };
}

describe("self-host helper", () => {
  it("lets an explicit COMPOSE_PROFILES override the derived default", () => {
    const helper = readRepoFile("self-host/compass");

    expect(helper).toContain(
      'COMPOSE_PROFILES="' + "$" + '{COMPOSE_PROFILES-$(default_profiles)}"',
    );
  });

  it("omits the selfhosted profile when mongo is external", async () => {
    // The 2026-07-29 production outage: an Atlas-backed install must not start
    // the bundled mongo, whose selfhosted overlay gates backend startup.
    const result = await runDefaultProfiles(
      [
        "mongo:",
        '  uri: "mongodb+srv://u:p@cluster.mongodb.net/prod_calendar"',
        "sync:",
        '  mongoUri: "mongodb+srv://u:p@cluster.mongodb.net/compass_sync"',
      ].join("\n"),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("sync");
  });

  it("keeps the selfhosted profile when mongo is the bundled service", async () => {
    const result = await runDefaultProfiles(
      ["mongo:", '  uri: "mongodb://user:pass@mongo:27017/compass"'].join("\n"),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("selfhosted");
  });

  it("adds sync alongside selfhosted when a sync database is provisioned", async () => {
    const result = await runDefaultProfiles(
      [
        "mongo:",
        '  uri: "mongodb://mongo:27017/compass"',
        "sync:",
        '  mongoUri: "mongodb://mongo:27017/compass_sync"',
      ].join("\n"),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("selfhosted,sync");
  });

  it("defaults to selfhosted before a mongo uri is configured", async () => {
    const result = await runDefaultProfiles(
      ["web:", "  port: 9080"].join("\n"),
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("selfhosted");
  });

  it("reads the Docker image version from runtime.version", () => {
    const helper = readRepoFile("self-host/compass");

    expect(helper).toContain("read_config_value runtime.version");
    expect(helper).not.toContain("read_config_value compose.version");
  });

  it("exports SYNC_PORT from sync.port, matching the web/backend port pattern", () => {
    const helper = readRepoFile("self-host/compass");

    expect(helper).toContain(
      'export SYNC_PORT="$(strip_quotes "$(read_config_value sync.port)")"',
    );
  });

  it("updates in place with compose wait", () => {
    const helper = readRepoFile("self-host/compass");

    expect(helper).toContain("compose up -d --remove-orphans --wait");
  });

  it("prunes unused images around update so release tags cannot fill the disk", () => {
    const helper = readRepoFile("self-host/compass");
    const updateBlock = helper.slice(helper.indexOf("\n  update)"));

    expect(helper).toContain("prune_unused_images");
    expect(helper).toContain("timeout 120 docker image prune -af");
    expect(updateBlock).toContain("compose logs --tail=100 mongo backend");
  });

  it("applies the selfhosted mongo overlay when the selfhosted profile is active", () => {
    const helper = readRepoFile("self-host/compass");

    expect(helper).toContain("compose.selfhosted.yaml");
    expect(helper).toContain("*,selfhosted,*)");
  });
});

describe("staging deploy workflow", () => {
  it("always passes COMPOSE_PROFILES including sync to compass update", () => {
    const workflow = readRepoFile(".github/workflows/_deploy-environment.yml");

    // Sync is required, so the deploy never falls back to an unscoped
    // `./compass update` that could omit the sync profile when an explicit
    // COMPOSE_PROFILES var (e.g. `selfhosted`) is set.
    expect(workflow).toContain(
      'DEPLOY_PROFILES="$'.concat(
        "{COMPOSE_PROFILES:+$",
        '{COMPOSE_PROFILES},}sync"',
      ),
    );
    expect(workflow).toContain(
      "cd ~/compass && COMPOSE_PROFILES='$" +
        "{DEPLOY_PROFILES}' ./compass update",
    );
    expect(workflow).not.toContain('if [ -n "$DEPLOY_PROFILES" ]; then');
  });

  it("derives runtime.nodeEnv from the GitHub Environment instead of hardcoding production", () => {
    // 2026-08-01: this was unconditionally "production" for every GitHub
    // Environment, including staging-cloud and staging-selfhosted. Staging
    // told its own telemetry (and any prod-scoped alert reading it) that it
    // was production, which silently polluted health signals with an idle
    // environment's data alongside the real thing.
    const workflow = readRepoFile(".github/workflows/_deploy-environment.yml");

    expect(workflow).not.toContain("'  nodeEnv: production'");
    expect(workflow).toContain('"  nodeEnv: ${NODE_ENV}"');
    expect(workflow).toContain('NODE_ENV="production"');
    expect(workflow).toContain('NODE_ENV="staging"');
  });

  it("falls back to the release tag when a configured compose ref is unavailable", () => {
    const workflow = readRepoFile(".github/workflows/_deploy-environment.yml");

    expect(workflow).toContain(
      'COMPOSE_GIT_REF="$'.concat("{COMPOSE_GIT_REF:-$", '{RELEASE_TAG}}"'),
    );
    expect(workflow).toContain('COMPOSE_GIT_REF="$'.concat('{RELEASE_TAG}"'));
  });

  it("updates the stack in place without tearing down data services first", () => {
    const workflow = readRepoFile(".github/workflows/_deploy-environment.yml");

    expect(workflow).not.toContain(
      "docker compose --project-name compass -f compose.yaml down",
    );
  });

  it("deploys the selfhosted mongo overlay alongside the base compose file", () => {
    const workflow = readRepoFile(".github/workflows/_deploy-environment.yml");

    expect(workflow).toContain(
      "self-host/compose.selfhosted.yaml -o ~/compass/compose.selfhosted.yaml",
    );
  });

  it("writes Microsoft, Apple, and credential encryption keys when present", () => {
    const workflow = readRepoFile(".github/workflows/_deploy-environment.yml");

    expect(workflow).toContain(
      "MICROSOFT_CLIENT_ID: $".concat("{{ vars.MICROSOFT_CLIENT_ID }}"),
    );
    expect(workflow).toContain(
      "MICROSOFT_CLIENT_SECRET: $".concat(
        "{{ secrets.MICROSOFT_CLIENT_SECRET }}",
      ),
    );
    expect(workflow).toContain(
      "APPLE_SIGNIN_PRIVATE_KEY: $".concat(
        "{{ secrets.APPLE_SIGNIN_PRIVATE_KEY }}",
      ),
    );
    expect(workflow).toContain(
      "SYNC_CREDENTIAL_ENCRYPTION_KEY: $".concat(
        "{{ secrets.SYNC_CREDENTIAL_ENCRYPTION_KEY }}",
      ),
    );
    expect(workflow).toContain("'microsoft:'");
    expect(workflow).toContain("'apple:'");
    expect(workflow).toContain(
      'credentialEncryptionKey: \\"$'.concat(
        '{SYNC_CREDENTIAL_ENCRYPTION_KEY}\\"',
      ),
    );
    expect(workflow).toContain("APPLE_PK_YAML=");
    expect(workflow).not.toContain("GCAL_NOTIFICATION_TOKEN");
    expect(workflow).not.toContain("notificationToken");
    expect(workflow).not.toContain("channelExpirationMin");
  });

  it("binds Stripe secrets directly and only writes the stripe block on hosted cloud", () => {
    const workflow = readRepoFile(".github/workflows/_deploy-environment.yml");

    expect(workflow).toContain(
      "STRIPE_SECRET_KEY: $".concat("{{ secrets.STRIPE_SECRET_KEY }}"),
    );
    expect(workflow).toContain(
      "STRIPE_WEBHOOK_SECRET: $".concat("{{ secrets.STRIPE_WEBHOOK_SECRET }}"),
    );
    expect(workflow).toContain(
      "STRIPE_PRICE_ID: $".concat("{{ secrets.STRIPE_PRICE_ID }}"),
    );
    expect(workflow).toContain(
      "STRIPE_PUBLISHABLE_KEY: $".concat("{{ vars.STRIPE_PUBLISHABLE_KEY }}"),
    );
    expect(workflow).not.toContain("&& secrets.STRIPE_SECRET_KEY ||");
    expect(workflow).toContain("'stripe:'");
    expect(workflow).toContain("publishableKey:");
    expect(workflow).toContain("staging-selfhosted must omit this block");
  });

  it("builds cloud deploy web images from a GitHub-only Dockerfile with PostHog config", () => {
    const workflow = readRepoFile(".github/workflows/_deploy-environment.yml");
    const dockerfile = readRepoFile(".github/docker/Dockerfile.web");

    expect(workflow).toContain("file: .github/docker/Dockerfile.web");
    expect(workflow).toContain("POSTHOG_KEY=$");
    expect(workflow).toContain("POSTHOG_HOST=$");
    expect(workflow).not.toContain("COMPASS_WEB_BUILD_CONFIG_B64");
    expect(workflow).not.toContain("base64");
    expect(dockerfile).toContain("ARG POSTHOG_KEY=");
    expect(dockerfile).toContain("ARG POSTHOG_HOST=");
    expect(dockerfile).toContain("'posthog:'");
  });

  it("always configures sync and fails early when required secrets are missing", () => {
    const workflow = readRepoFile(".github/workflows/_deploy-environment.yml");

    expect(workflow).toContain(
      "SYNC_MONGO_URI: $".concat("{{ secrets.SYNC_MONGO_URI }}"),
    );
    expect(workflow).toContain(
      "SYNC_INTERNAL_AUTH_TOKEN: $".concat(
        "{{ secrets.SYNC_INTERNAL_AUTH_TOKEN }}",
      ),
    );
    // Sync is required (#2480): missing auth token aborts before compose starts.
    expect(workflow).toContain('if [ -z "$SYNC_INTERNAL_AUTH_TOKEN" ]; then');
    expect(workflow).toContain("Deploy requires SYNC_INTERNAL_AUTH_TOKEN");
    // Cloud still needs an isolated SYNC_MONGO_URI; selfhosted derives one
    // from the bundled mongo, matching install.sh / compass.example.yaml.
    expect(workflow).toContain("Cloud deploy requires SYNC_MONGO_URI");
    expect(workflow).toContain(
      "mongodb://compass:$".concat(
        "{MONGO_PASSWORD}@mongo:27017/compass_sync?authSource=admin&replicaSet=rs0",
      ),
    );
    expect(workflow).toContain('SYNC_ENFORCE_LEAST_PRIVILEGE="false"');
    // Sync config + profile are unconditional — never skip and leave the
    // backend without SYNC_SERVICE_URL / SYNC_INTERNAL_AUTH_TOKEN.
    expect(workflow).not.toContain("SYNC_ENABLED=");
    expect(workflow).not.toContain("skipping sync");
    expect(workflow).toContain("'sync:'");
    expect(workflow).toContain('mongoUri: \\"$'.concat('{SYNC_MONGO_URI}\\"'));
    expect(workflow).toContain(
      "enforceLeastPrivilege: $".concat("{SYNC_ENFORCE_LEAST_PRIVILEGE}"),
    );
    expect(workflow).toContain('serviceUrl: "http://sync:3010"');
    expect(workflow).toContain(
      "SYNC_EXECUTION: $".concat("{{ vars.SYNC_EXECUTION }}"),
    );
    expect(workflow).toContain(
      'DEPLOY_PROFILES="$'.concat(
        "{COMPOSE_PROFILES:+$",
        '{COMPOSE_PROFILES},}sync"',
      ),
    );
  });

  it("runs deploy health checks after each staging deploy", () => {
    const workflow = readRepoFile(".github/workflows/deploy-staging.yml");

    expect(workflow).toContain(
      "uses: ./.github/workflows/deploy-health-check.yml",
    );
    expect(workflow).toContain("needs: deploy-cloud");
    expect(workflow).toContain("environment: staging-cloud");
    expect(workflow).toContain("profile: cloud");
    expect(workflow).toContain("needs: deploy-selfhosted");
    expect(workflow).toContain("environment: staging-selfhosted");
    expect(workflow).toContain("profile: selfhosted");
  });

  it("provides a manual production deploy workflow with cloud health checks", () => {
    const workflow = readRepoFile(".github/workflows/deploy-production.yml");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("workflow_call:");
    expect(workflow).toContain(
      "uses: ./.github/workflows/_deploy-environment.yml",
    );
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain(
      "uses: ./.github/workflows/deploy-health-check.yml",
    );
    expect(workflow).toContain("needs: deploy");
    expect(workflow).toContain("profile: cloud");
  });

  it("provides a reusable deploy health check workflow with Discord failure alerts", () => {
    const workflow = readRepoFile(".github/workflows/deploy-health-check.yml");

    expect(workflow).toContain("workflow_call:");
    expect(workflow).toContain("tag:");
    expect(workflow).toContain("environment:");
    expect(workflow).toContain("profile:");
    expect(workflow).toContain("DISCORD_DEPLOY_WEBHOOK_URL");
    expect(workflow).toContain(
      "EXPECTED_VERSION: $".concat("{{ inputs.tag }}"),
    );
    expect(workflow).toContain(".github/scripts/deploy-health-check.sh");
  });
});

describe("deploy health check script", () => {
  it("accepts an HTML frontend response", async () => {
    const dir = makeTempDir();
    const bodyPath = join(dir, "frontend.html");
    const headersPath = join(dir, "headers.txt");
    writeFileSync(bodyPath, "<!doctype html><html><body>Compass</body></html>");
    writeFileSync(headersPath, "HTTP/2 200\r\ncontent-type: text/html\r\n");

    const result = await runHealthScript(["validate-frontend"], {
      FRONTEND_BODY_FILE: bodyPath,
      FRONTEND_HEADERS_FILE: headersPath,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("frontend-http");
  });

  it("rejects a non-2xx frontend response", async () => {
    const dir = makeTempDir();
    const bodyPath = join(dir, "frontend.html");
    const headersPath = join(dir, "headers.txt");
    writeFileSync(bodyPath, "<!doctype html><html><body>Compass</body></html>");
    writeFileSync(headersPath, "HTTP/2 503\r\ncontent-type: text/html\r\n");

    const result = await runHealthScript(["validate-frontend"], {
      FRONTEND_BODY_FILE: bodyPath,
      FRONTEND_HEADERS_FILE: headersPath,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("frontend-http");
  });

  it("rejects a non-HTML frontend response", async () => {
    const dir = makeTempDir();
    const bodyPath = join(dir, "frontend.json");
    const headersPath = join(dir, "headers.txt");
    writeFileSync(bodyPath, '{"ok":true}');
    writeFileSync(
      headersPath,
      "HTTP/2 200\r\ncontent-type: application/json\r\n",
    );

    const result = await runHealthScript(["validate-frontend"], {
      FRONTEND_BODY_FILE: bodyPath,
      FRONTEND_HEADERS_FILE: headersPath,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("frontend-content-type");
  });

  it("rejects an empty frontend response body", async () => {
    const dir = makeTempDir();
    const bodyPath = join(dir, "frontend.html");
    const headersPath = join(dir, "headers.txt");
    writeFileSync(bodyPath, "");
    writeFileSync(headersPath, "HTTP/2 200\r\ncontent-type: text/html\r\n");

    const result = await runHealthScript(["validate-frontend"], {
      FRONTEND_BODY_FILE: bodyPath,
      FRONTEND_HEADERS_FILE: headersPath,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("frontend-body");
  });

  it("accepts a frontend version response that matches the release tag", async () => {
    const dir = makeTempDir();
    const bodyPath = join(dir, "version.json");
    writeFileSync(bodyPath, '{"version":"0.5.27"}');

    const result = await runHealthScript(["validate-frontend-version"], {
      FRONTEND_VERSION_BODY_FILE: bodyPath,
      RELEASE_TAG: "v0.5.27",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("frontend-version");
  });

  it("rejects a frontend version response that does not match the release tag", async () => {
    const dir = makeTempDir();
    const bodyPath = join(dir, "version.json");
    writeFileSync(bodyPath, '{"version":"0.5.26"}');

    const result = await runHealthScript(["validate-frontend-version"], {
      FRONTEND_VERSION_BODY_FILE: bodyPath,
      RELEASE_TAG: "v0.5.27",
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("frontend-version");
    expect(result.stderr).toContain("expected 0.5.27, got 0.5.26");
  });

  it("uses the sync profile for cloud deployments", async () => {
    const result = await runHealthScriptFunction("remote_compose_prefix", {
      PROFILE: "cloud",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("COMPOSE_PROFILES=sync");
  });

  it("uses selfhosted and sync profiles for selfhosted deployments", async () => {
    const result = await runHealthScriptFunction("remote_compose_prefix", {
      PROFILE: "selfhosted",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("COMPOSE_PROFILES=selfhosted,sync");
    expect(result.stdout).toContain("docker compose --project-name compass");
  });

  it("joins BACKEND_API_URL onto /config the same way as /health", () => {
    const script = readRepoFile(".github/scripts/deploy-health-check.sh");

    expect(script).toContain('url="${BACKEND_API_URL%/}/health"');
    expect(script).toContain('url="${BACKEND_API_URL%/}/config"');
    expect(script).not.toContain('url="${BACKEND_API_URL%/}/api/config"');
  });

  it("probes /api/config when BACKEND_API_URL already ends in /api", async () => {
    const requested: string[] = [];
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        const path = new URL(req.url).pathname;
        requested.push(path);
        if (path === "/api/config") {
          return Response.json({ version: "0.5.27" });
        }
        return new Response("not found", { status: 404 });
      },
    });

    try {
      const result = await runHealthScriptFunction(
        "validate_backend_config_version; exit $?",
        {
          BACKEND_API_URL: `http://127.0.0.1:${server.port}/api`,
          RELEASE_TAG: "v0.5.27",
          SSH_TARGET: "",
        },
      );

      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("ok backend-config-version");
      expect(requested).toEqual(["/api/config"]);
    } finally {
      server.stop(true);
    }
  });
});
