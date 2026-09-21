import {
  LIST_EVENTS_CONCURRENCY,
  runWithListEventsLimit,
} from "@backend/common/services/sync-service/list-events-concurrency";

describe("runWithListEventsLimit", () => {
  it("caps in-flight work at LIST_EVENTS_CONCURRENCY", async () => {
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    const started = Array.from({ length: 10 }, () =>
      runWithListEventsLimit(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active -= 1;
      }),
    );

    await Bun.sleep(0);
    expect(active).toBe(LIST_EVENTS_CONCURRENCY);

    while (releases.length > 0 || active > 0) {
      releases.splice(0).forEach((release) => release());
      await Bun.sleep(0);
    }

    await Promise.all(started);
    expect(peak).toBe(LIST_EVENTS_CONCURRENCY);
  });
});
