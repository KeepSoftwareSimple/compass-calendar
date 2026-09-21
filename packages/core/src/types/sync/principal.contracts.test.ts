import {
  type PrincipalPurgeResponse,
  PrincipalPurgeResponseSchema,
} from "@core/types/sync/principal.contracts";
import { describe, expect, it } from "bun:test";

const okCounts = (): PrincipalPurgeResponse => ({
  connections: 1,
  credentials: 1,
  calendars: 2,
  events: 3,
  eventOccurrences: 4,
  syncResources: 2,
  commands: 0,
  jobs: 1,
  deletionMarkers: 0,
  invalidations: 5,
});

describe("PrincipalPurgeResponseSchema", () => {
  it("accepts a full non-negative count bag", () => {
    expect(PrincipalPurgeResponseSchema.safeParse(okCounts()).success).toBe(
      true,
    );
  });

  it("accepts an all-zero idempotent retry", () => {
    const empty = Object.fromEntries(
      Object.keys(okCounts()).map((key) => [key, 0]),
    );
    expect(PrincipalPurgeResponseSchema.safeParse(empty).success).toBe(true);
  });

  it("rejects a negative count", () => {
    expect(
      PrincipalPurgeResponseSchema.safeParse({
        ...okCounts(),
        events: -1,
      }).success,
    ).toBe(false);
  });

  it("strips an unknown field so a rolling deploy cannot 502", () => {
    const parsed = PrincipalPurgeResponseSchema.parse({
      ...okCounts(),
      extra: 1,
    });
    expect("extra" in parsed).toBe(false);
  });

  it("rejects a missing field", () => {
    const { connections: _, ...rest } = okCounts();
    expect(PrincipalPurgeResponseSchema.safeParse(rest).success).toBe(false);
  });
});
