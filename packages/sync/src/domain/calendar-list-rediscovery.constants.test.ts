import {
  CALENDAR_LIST_REDISCOVERY_SWEEP_INTERVAL_MS,
  CALENDAR_LIST_STALE_AFTER_MS,
  FOREGROUND_CALENDAR_LIST_STALE_AFTER_MS,
} from "./calendar-list-rediscovery.constants";
import { describe, expect, it } from "bun:test";

// Documents worst-case background latency before this change (~10m sweep +
// 24h list staleness) vs targets after. Microsoft has no Graph calendar-list
// watch; these constants bound idle discovery latency.
describe("calendar-list rediscovery latency bounds", () => {
  it("background idle worst case is stale window plus one sweep interval", () => {
    const worstCaseMs =
      CALENDAR_LIST_STALE_AFTER_MS +
      CALENDAR_LIST_REDISCOVERY_SWEEP_INTERVAL_MS;
    expect(worstCaseMs).toBeLessThanOrEqual(6 * 60_000);
    expect(CALENDAR_LIST_STALE_AFTER_MS).toBe(3 * 60_000);
    expect(CALENDAR_LIST_REDISCOVERY_SWEEP_INTERVAL_MS).toBe(2 * 60_000);
  });

  it("foreground with open SSE is bounded by list staleness plus 15s tick", () => {
    // See packages/backend/src/servers/sse/foreground-sync-refresh.ts DEFAULT_INTERVAL_MS.
    const foregroundTickMs = 15_000;
    const worstCaseMs =
      FOREGROUND_CALENDAR_LIST_STALE_AFTER_MS + foregroundTickMs;
    expect(FOREGROUND_CALENDAR_LIST_STALE_AFTER_MS).toBe(60_000);
    expect(worstCaseMs).toBeLessThanOrEqual(90_000);
  });
});
