import { QueryObserver } from "@tanstack/react-query";
import { createCompassQueryClient } from "./query-client";
import { describe, expect, test } from "bun:test";

describe("createCompassQueryClient", () => {
  test("disables retries and treats completed queries as stale", () => {
    const client = createCompassQueryClient();
    const defaults = client.getDefaultOptions();

    expect(defaults.queries?.retry).toBe(false);
    expect(defaults.queries?.retryOnMount).toBe(false);
    expect(defaults.queries?.staleTime).toBe(0);
    expect(defaults.mutations?.retry).toBe(false);
  });

  // calendarQueryKeys.all alone is read by 16 components. They mount at
  // slightly different moments, so each failed fetch has already resolved
  // before the next observer subscribes and TanStack's in-flight dedupe never
  // fires - with retryOnMount left on, one unreachable backend produced one
  // request per call site (prod saw exactly 16 GET /calendars in 1.3s during
  // the 2026-08-21 sync restart).
  test("an errored query is fetched once, not once per mounting observer", async () => {
    let fetches = 0;
    const client = createCompassQueryClient();
    const options = {
      queryKey: ["calendars"],
      queryFn: async () => {
        fetches += 1;
        throw new Error("backend unavailable");
      },
      staleTime: 60_000,
    };

    const unsubscribes: Array<() => void> = [];
    for (let i = 0; i < 16; i++) {
      const observer = new QueryObserver(client, options as never);
      // Mount progressively, and wait for the query to be genuinely settled
      // before the next observer subscribes. A fixed sleep would let a slow
      // worker leave the fetch in flight, where the later observers dedupe
      // into it and the test reports 1 fetch whether or not retryOnMount is
      // set - passing for the wrong reason, and silently stopping guarding.
      await new Promise<void>((resolve) => {
        unsubscribes.push(
          observer.subscribe((result) => {
            if (result.isError && result.fetchStatus === "idle") resolve();
          }),
        );
        if (observer.getCurrentResult().fetchStatus === "idle") resolve();
      });
    }
    unsubscribes.forEach((unsubscribe) => unsubscribe());

    expect(fetches).toBe(1);
  });

  test("creates isolated query caches", () => {
    const first = createCompassQueryClient();
    const second = createCompassQueryClient();

    first.setQueryData(["probe"], "first");

    expect(first.getQueryData<string>(["probe"])).toBe("first");
    expect(second.getQueryData(["probe"])).toBeUndefined();
  });
});
