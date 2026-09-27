import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("calendar-web router.routes", () => {
  it("does not declare guest /meet or legacy /book routes", () => {
    const source = readFileSync(
      path.join(import.meta.dir, "router.routes.tsx"),
      "utf8",
    );
    expect(source).not.toMatch(/path:\s*["']\/meet/);
    expect(source).not.toMatch(/path:\s*["']\/book/);
  });
});
