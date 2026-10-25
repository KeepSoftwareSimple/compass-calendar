import {
  GO_TO_DATE_PARSE_VECTORS,
  GO_TO_DATE_REFERENCE_NOW_ISO,
} from "@core/test/go-to-date.vectors.data";
import { describe, expect, it } from "bun:test";

describe("go-to-date vector data", () => {
  it("uses a stable reference now for parse vectors", () => {
    expect(GO_TO_DATE_REFERENCE_NOW_ISO).toBe("2026-09-15T12:00:00.000Z");
    expect(GO_TO_DATE_PARSE_VECTORS.length).toBeGreaterThan(20);
  });

  it("gives each parse vector a unique id slug", () => {
    const ids = GO_TO_DATE_PARSE_VECTORS.map(
      ({ input }) => `parse-${input.replace(/\s+/g, "-")}`,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
