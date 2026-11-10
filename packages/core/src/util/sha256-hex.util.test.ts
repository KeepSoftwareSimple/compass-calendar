import { sha256HexFromUtf8 } from "@core/util/sha256-hex.util";
import { describe, expect, it } from "bun:test";

describe("sha256HexFromUtf8", () => {
  it("matches node crypto for a sample string", () => {
    expect(sha256HexFromUtf8("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(
      sha256HexFromUtf8("65b80e635088efa5d8477a66:2026-11-12T00:00:00.000Z"),
    ).toBe("c41b923eedccbca418a541daa83042e0bf2cea671169e75fa83c0874e9d5719a");
  });
});
