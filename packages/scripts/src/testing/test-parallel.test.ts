import { testArgvFor } from "./test-parallel";
import { describe, expect, it } from "bun:test";

const argvOpts = {
  preloadPath: "packages/web/src/__tests__/web.preload.ts",
  bunFlags: [] as string[],
  targets: ["./packages/web/src"],
};

describe("testArgvFor", () => {
  it("passes --parallel for the web profile", () => {
    expect(testArgvFor("web", argvOpts)).toContain("--parallel");
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

  it("passes --parallel for mongo-free fast profiles", () => {
    expect(
      testArgvFor("backend-fast", {
        ...argvOpts,
        preloadPath: "packages/backend/src/__tests__/backend.preload.fast.ts",
        targets: ["./packages/backend/src"],
      }),
    ).toContain("--parallel");
  });
});
