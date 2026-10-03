import {
  parseExtraArgs,
  pathMatchesIgnore,
  resolveTestTargets,
} from "@scripts/testing/runner-utils";
import { describe, expect, it } from "bun:test";

describe("parseExtraArgs", () => {
  it("keeps every --path-ignore-patterns value", () => {
    expect(
      parseExtraArgs([
        "--path-ignore-patterns",
        "**/*.db.test.ts",
        "--path-ignore-patterns",
        "**/header-session.test.ts",
      ]).ignorePatterns,
    ).toEqual(["**/*.db.test.ts", "**/header-session.test.ts"]);
  });
});

describe("pathMatchesIgnore", () => {
  it("matches db tests with or without a ./ prefix", () => {
    expect(
      pathMatchesIgnore(
        "./packages/backend/src/email/email.heartbeat.db.test.ts",
        ["**/*.db.test.ts"],
      ),
    ).toBe(true);
    expect(
      pathMatchesIgnore(
        "packages/backend/src/email/email.heartbeat.db.test.ts",
        ["**/*.db.test.ts"],
      ),
    ).toBe(true);
  });

  it("does not match unit tests", () => {
    expect(
      pathMatchesIgnore(
        "./packages/backend/src/billing/controllers/billing.controller.test.ts",
        ["**/*.db.test.ts"],
      ),
    ).toBe(false);
  });
});

describe("resolveTestTargets", () => {
  it("drops ignored files when expanding a package directory", () => {
    const { targets } = resolveTestTargets(
      "./packages/backend/src",
      [
        "--path-ignore-patterns",
        "**/*.db.test.ts",
        "--path-ignore-patterns",
        "**/header-session.test.ts",
      ],
      { expandDirectory: true },
    );

    expect(targets.some((file) => file.endsWith(".db.test.ts"))).toBe(false);
    expect(
      targets.some((file) => file.includes("header-session.test.ts")),
    ).toBe(false);
    expect(
      targets.some((file) => file.endsWith("billing.controller.test.ts")),
    ).toBe(true);
  });
});
