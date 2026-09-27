import { createGoogleSyncRefreshCoordinator } from "@web/auth/providers/sync.refresh";
import { describe, expect, it, mock } from "bun:test";

describe("createGoogleSyncRefreshCoordinator", () => {
  it("shares one in-flight refresh across callers", async () => {
    let resolveRequest:
      | ((value: {
          enqueued: number;
          inFlight: number;
          resources: number;
        }) => void)
      | undefined;
    const request = mock(
      () =>
        new Promise<{
          enqueued: number;
          inFlight: number;
          resources: number;
        }>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const coordinator = createGoogleSyncRefreshCoordinator(request, {
      timeoutMs: 60_000,
    });

    const first = coordinator.refresh();
    const second = coordinator.refresh();

    expect(second).toBe(first);
    expect(request).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot().isRefreshing).toBe(true);

    resolveRequest?.({ enqueued: 1, inFlight: 0, resources: 1 });
    await first;

    expect(coordinator.getSnapshot().isRefreshing).toBe(true);
    expect(coordinator.getSnapshot().refreshRequestedAt).not.toBeNull();
  });

  it("keeps Catching up until noteConnectionImproved or timeout", async () => {
    const timers: Array<{ ms: number; cb: () => void }> = [];
    const request = mock(async () => ({
      enqueued: 1,
      inFlight: 0,
      resources: 1,
    }));
    const coordinator = createGoogleSyncRefreshCoordinator(request, {
      now: () => 1_000,
      timeoutMs: 50,
      schedule: (cb, ms) => {
        timers.push({ ms, cb });
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
      cancel: () => {
        timers.length = 0;
      },
    });

    await coordinator.refresh();
    expect(coordinator.getSnapshot().isRefreshing).toBe(true);
    expect(timers).toHaveLength(1);
    expect(timers[0]?.ms).toBe(50);

    coordinator.noteConnectionImproved();
    expect(coordinator.getSnapshot()).toEqual({
      isRefreshing: false,
      refreshRequestedAt: null,
      gaveUp: false,
    });
  });

  it("gives up after the catch-up timeout without improvement", async () => {
    const timers: Array<{ ms: number; cb: () => void }> = [];
    const request = mock(async () => ({
      enqueued: 0,
      inFlight: 1,
      resources: 1,
    }));
    const coordinator = createGoogleSyncRefreshCoordinator(request, {
      now: () => 2_000,
      timeoutMs: 25,
      schedule: (cb, ms) => {
        timers.push({ ms, cb });
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
      cancel: mock(),
    });

    await coordinator.refresh();
    expect(coordinator.getSnapshot().isRefreshing).toBe(true);
    timers[0]?.cb();
    expect(coordinator.getSnapshot()).toEqual({
      isRefreshing: false,
      refreshRequestedAt: 2_000,
      gaveUp: true,
    });
  });
});
