import { normalizeDeployVersion } from "@core/util/deploy-version.util";
import { describe, expect, it } from "bun:test";

describe("normalizeDeployVersion", () => {
  it("strips a leading v from release tags", () => {
    expect(normalizeDeployVersion("v0.5.4")).toBe("0.5.4");
  });

  it("defaults missing values to dev", () => {
    expect(normalizeDeployVersion(undefined)).toBe("dev");
    expect(normalizeDeployVersion("")).toBe("dev");
  });

  it("passes through build SHAs and pinned tags", () => {
    expect(normalizeDeployVersion("a1b2c3d")).toBe("a1b2c3d");
    expect(normalizeDeployVersion("0.5.4")).toBe("0.5.4");
  });
});
