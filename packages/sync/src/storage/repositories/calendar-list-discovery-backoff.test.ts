import {
  DURABLE_DISCOVERY_FAILURE_RETRY_MS,
  isCalendarListDiscoveryInBackoff,
} from "@sync/storage/repositories/sync-resource.repository";
import { describe, expect, it } from "bun:test";

const now = new Date("2026-11-03T12:00:00.000Z");

describe("isCalendarListDiscoveryInBackoff", () => {
  it("skips a refused list that was attempted inside the window", () => {
    expect(
      isCalendarListDiscoveryInBackoff(
        {
          lastReadFailureAt: now,
          lastAttemptAt: new Date(now.getTime() - 1),
        },
        now,
      ),
    ).toBe(true);
  });

  it("lets a refused list through once the window lapses", () => {
    expect(
      isCalendarListDiscoveryInBackoff(
        {
          lastReadFailureAt: now,
          lastAttemptAt: new Date(
            now.getTime() - DURABLE_DISCOVERY_FAILURE_RETRY_MS,
          ),
        },
        now,
      ),
    ).toBe(false);
  });

  it("does not back off a list that never failed or never attempted", () => {
    expect(
      isCalendarListDiscoveryInBackoff(
        { lastReadFailureAt: null, lastAttemptAt: now },
        now,
      ),
    ).toBe(false);
    expect(
      isCalendarListDiscoveryInBackoff(
        { lastReadFailureAt: now, lastAttemptAt: null },
        now,
      ),
    ).toBe(false);
    expect(isCalendarListDiscoveryInBackoff(undefined, now)).toBe(false);
  });
});
