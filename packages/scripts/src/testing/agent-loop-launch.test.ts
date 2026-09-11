import { afterEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function writeExecutable(path: string, contents: string) {
  writeFileSync(path, contents, { mode: 0o755 });
}

function runLaunch(status: string, retryAfter = "") {
  const directory = mkdtempSync(join(tmpdir(), "agent-loop-launch-"));
  temporaryDirectories.push(directory);
  const bin = join(directory, "bin");
  const log = join(directory, "commands.log");
  const output = join(directory, "github-output");
  mkdirSync(bin);

  writeExecutable(
    join(bin, "gh"),
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$AGENT_LOOP_TEST_LOG"
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  printf 'Compass Booking v1'
fi
`,
  );
  writeExecutable(
    join(bin, "curl"),
    `#!/usr/bin/env bash
set -euo pipefail
response_file=""
headers_file=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) response_file="$2"; shift 2 ;;
    -D) headers_file="$2"; shift 2 ;;
    *) shift ;;
  esac
done
printf '{"error":"simulated"}' > "$response_file"
if [ -n "$headers_file" ]; then
  printf 'retry-after: %s\\r\\n' "$AGENT_LOOP_TEST_RETRY_AFTER" > "$headers_file"
fi
printf '%s' "$AGENT_LOOP_TEST_STATUS"
`,
  );

  const result = spawnSync(
    "bash",
    [".github/scripts/agent-loop-launch.sh", "42"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        AGENT_LOOP_TEST_LOG: log,
        AGENT_LOOP_TEST_RETRY_AFTER: retryAfter,
        AGENT_LOOP_TEST_STATUS: status,
        CURSOR_API_KEY: "test-key",
        GITHUB_OUTPUT: output,
        GITHUB_REPOSITORY: "example/compass",
        PATH: `${bin}:${process.env["PATH"]}`,
      },
    },
  );

  return {
    ...result,
    commands: existsSync(log) ? readFileSync(log, "utf8") : "",
    output: existsSync(output) ? readFileSync(output, "utf8") : "",
  };
}

function runPicker(retryAt: string) {
  const directory = mkdtempSync(join(tmpdir(), "agent-loop-picker-"));
  temporaryDirectories.push(directory);
  const bin = join(directory, "bin");
  const output = join(directory, "github-output");
  mkdirSync(bin);

  writeExecutable(
    join(bin, "gh"),
    `#!/usr/bin/env bash
set -euo pipefail
if [ "$1" = "issue" ]; then
  printf '[{"number":42,"title":"Booking contracts","url":"https://example.test/issues/42"}]'
  exit 0
fi
if [ "$1" = "api" ]; then
  printf '<!-- agent-loop-quota-retry-at=%s -->\\n' "$AGENT_LOOP_TEST_RETRY_AT"
  exit 0
fi
exit 1
`,
  );

  const result = spawnSync("bash", [".github/scripts/agent-loop-next.sh"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      AGENT_LOOP_TEST_RETRY_AT: retryAt,
      AGENT_LOOP_MILESTONES: "Compass Booking v1",
      GITHUB_OUTPUT: output,
      GITHUB_REPOSITORY: "example/compass",
      PATH: `${bin}:${process.env["PATH"]}`,
    },
  });

  return {
    ...result,
    output: existsSync(output) ? readFileSync(output, "utf8") : "",
  };
}

describe("agent-loop launch quota recovery", () => {
  it("records HTTP 429 as an hourly-retryable credit wait", () => {
    const result = runLaunch("429", "120");

    expect(result.status, result.stderr).toBe(0);
    expect(result.commands).toContain("agent-loop-waiting-for-credits");
    expect(result.commands).toContain("agent-loop-quota-retry-at=");
    expect(result.commands).not.toContain("--add-label agent-loop-needs-human");
    expect(result.output).toContain("launch_mode=quota-wait");
    expect(result.output).toContain("retry_after_seconds=3600");
  });

  it("keeps non-quota launch failures as human stops", () => {
    const result = runLaunch("403");

    expect(result.status, result.stderr).toBe(1);
    expect(result.commands).toContain("--add-label agent-loop-needs-human");
    expect(result.commands).not.toContain(
      "--add-label agent-loop-waiting-for-credits",
    );
    expect(result.commands).not.toContain("agent-loop: pickup");
  });

  it("fails closed when CURSOR_API_KEY is unset", () => {
    const directory = mkdtempSync(join(tmpdir(), "agent-loop-launch-nokey-"));
    temporaryDirectories.push(directory);
    const bin = join(directory, "bin");
    const log = join(directory, "commands.log");
    const output = join(directory, "github-output");
    mkdirSync(bin);
    writeExecutable(
      join(bin, "gh"),
      `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$AGENT_LOOP_TEST_LOG"
`,
    );

    const result = spawnSync(
      "bash",
      [".github/scripts/agent-loop-launch.sh", "42"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          AGENT_LOOP_TEST_LOG: log,
          GITHUB_OUTPUT: output,
          GITHUB_REPOSITORY: "example/compass",
          PATH: `${bin}:${process.env["PATH"]}`,
          CURSOR_API_KEY: "",
        },
      },
    );

    expect(result.status, result.stderr).toBe(1);
    const commands = existsSync(log) ? readFileSync(log, "utf8") : "";
    const githubOutput = existsSync(output) ? readFileSync(output, "utf8") : "";
    expect(commands).toContain("--add-label agent-loop-needs-human");
    expect(commands).not.toContain("agent-loop: pickup");
    expect(commands).not.toContain("issue comment");
    expect(githubOutput).toContain("launch_mode=missing-key");
  });

  it("does not launch before the recorded credit retry time", () => {
    const result = runPicker("2999-01-01T00:00:00Z");

    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toContain("found=false");
  });

  it("retries the waiting issue after the recorded credit retry time", () => {
    const result = runPicker("2000-01-01T00:00:00Z");

    expect(result.status, result.stderr).toBe(0);
    expect(result.output).toContain("found=true");
    expect(result.output).toContain("issue_number=42");
  });
});
