import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LIVE_SMOKE_TS = join(
  process.cwd(),
  "packages/sync/src/providers/__contract__/live-provider-smoke.ts",
);

describe("live-provider-smoke expected providers", () => {
  it("routes each provider smoke through one shared setup-and-create helper", () => {
    const source = readFileSync(LIVE_SMOKE_TS, "utf8");
    const helperCalls = source.match(/setupAndCreateLiveSmokeEvent\(/g) ?? [];
    expect(helperCalls).toHaveLength(4);
    for (const provider of ["microsoft", "apple", "google"] as const) {
      expect(source).toMatch(
        new RegExp(
          `run${provider[0]!.toUpperCase()}${provider.slice(1)}LiveSmoke[\\s\\S]*?setupAndCreateLiveSmokeEvent\\([\\s\\S]*?provider: "${provider}"`,
        ),
      );
    }
  });
  it("fails when an expected provider lacks creds and skips others", () => {
    const result = spawnSync(
      "bash",
      [".github/scripts/live-provider-smoke.test.sh"],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(result.stdout).toContain("expected missing creds exits 1");
    expect(result.stdout).toContain(
      "expected ready providers exit 0 when bun passes",
    );
    expect(result.stdout).toContain("nothing expected and all skipped exits 0");
  });
});
