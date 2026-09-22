import {
  findTodoCopyViolations,
  TODO_COPY_ALLOWLIST,
} from "@scripts/testing/check-todo-copy";
import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("findTodoCopyViolations", () => {
  it("allows the welcome content file in the allowlist", () => {
    expect(
      [...TODO_COPY_ALLOWLIST].some((path) =>
        path.endsWith("welcome-sequence.content.ts"),
      ),
    ).toBe(true);
  });

  it("flags placeholder markers in other package files", () => {
    const root = mkdtempSync(join(tmpdir(), "todo-copy-root-"));
    mkdirSync(join(root, "packages", "web", "src"), { recursive: true });
    const marker = `TODO${"(copy)"}`;
    writeFileSync(
      join(root, "packages", "web", "src", "Bad.tsx"),
      `export const x = "${marker}";\n`,
      "utf8",
    );

    expect(findTodoCopyViolations(root)).toEqual(["packages/web/src/Bad.tsx"]);
  });
});
