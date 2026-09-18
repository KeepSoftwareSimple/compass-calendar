import { parallelArgsFor, testArgvFor } from "./test-parallel";
import { describe, expect, it } from "bun:test";

const argvOpts = {
  preloadPath: "packages/web/src/__tests__/web.preload.ts",
  bunFlags: [] as string[],
  targets: ["./packages/web/src"],
};

describe("parallelArgsFor", () => {
  it("uses capped parallel flags for web", () => {
    expect(parallelArgsFor("web")).toEqual(["--parallel=2", "--no-isolate"]);
    expect(parallelArgsFor("core")).toEqual(["--parallel"]);
  });
});

describe("testArgvFor", () => {
  it("passes web parallel flags in argv", () => {
    expect(testArgvFor("web", argvOpts)).toEqual(
      expect.arrayContaining(["--parallel=2", "--no-isolate"]),
    );
  });

  it("passes --parallel for core", () => {
    expect(
      testArgvFor("core", {
        ...argvOpts,
        preloadPath: "packages/scripts/src/testing/core.preload.ts",
        targets: ["./packages/core/src"],
      }),
    ).toContain("--parallel");
  });
});
