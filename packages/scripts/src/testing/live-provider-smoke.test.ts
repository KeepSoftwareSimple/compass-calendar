import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";

describe("live-provider-smoke expected providers", () => {
  it("fails when an expected provider is skipped and warns otherwise", () => {
    const result = spawnSync(
      "bash",
      [".github/scripts/live-provider-smoke.test.sh"],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(result.status, result.stderr + result.stdout).toBe(0);
    expect(result.stdout).toContain("expected microsoft skipped exits 1");
    expect(result.stdout).toContain(
      "unexpected skip exits 0 when expected provider ran",
    );
    expect(result.stdout).toContain("nothing expected and all skipped exits 0");
  });
});
