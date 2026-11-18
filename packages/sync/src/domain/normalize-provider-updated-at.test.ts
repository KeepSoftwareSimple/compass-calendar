import { normalizeProviderUpdatedAtForFingerprint } from "@sync/domain/provider-page-applier";
import { describe, expect, it } from "bun:test";

describe("normalizeProviderUpdatedAtForFingerprint", () => {
  it("normalizes equivalent instants across Date and ISO strings", () => {
    const utc = new Date("2026-07-09T18:30:00.000Z");
    expect(normalizeProviderUpdatedAtForFingerprint(utc)).toBe(
      "2026-07-09T18:30:00.000Z",
    );
    expect(
      normalizeProviderUpdatedAtForFingerprint("2026-07-09T18:30:00Z"),
    ).toBe("2026-07-09T18:30:00.000Z");
    expect(
      normalizeProviderUpdatedAtForFingerprint("2026-07-09T11:30:00-07:00"),
    ).toBe("2026-07-09T18:30:00.000Z");
  });
});
