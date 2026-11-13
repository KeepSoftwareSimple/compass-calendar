import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("desktop:export timezone pinning", () => {
  it("passes --check when TZ is unset at startup", async () => {
    const output = mkdtempSync(join(tmpdir(), "compass-export-test-"));
    const env = { ...process.env, COMPASS_MACOS_DIR: output };
    try {
      delete env["TZ"];
      const child = Bun.spawn(
        [process.execPath, "packages/scripts/src/cli.ts", "desktop:export"],
        { env, stdout: "pipe", stderr: "pipe" },
      );
      const [stderr, code] = await Promise.all([
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect({ code, stderr }).toEqual({ code: 0, stderr: expect.any(String) });
      const check = Bun.spawn(
        [
          process.execPath,
          "packages/scripts/src/cli.ts",
          "desktop:export",
          "--check",
        ],
        { env, stdout: "pipe", stderr: "pipe" },
      );
      const checkError = await new Response(check.stderr).text();
      expect({ code: await check.exited, stderr: checkError }).toEqual({
        code: 0,
        stderr: expect.any(String),
      });
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  }, 120_000);
});
