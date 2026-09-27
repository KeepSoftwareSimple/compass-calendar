import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "bun:test";

const { refreshEventRepositorySource, useEventRepositorySource } =
  require("./event.repository.source.store") as typeof import("./event.repository.source.store");

describe("event repository source store", () => {
  it("flips the source and notifies subscribers on refresh", () => {
    const { result } = renderHook(() => useEventRepositorySource());

    // First use computes lazily from the remembered session flag (false).
    expect(result.current).toBe("local");

    act(() => refreshEventRepositorySource(true));
    expect(result.current).toBe("remote");

    act(() => refreshEventRepositorySource(false));
    expect(result.current).toBe("local");
  });

  it("reuses the remembered session flag when none is passed", () => {
    const { result } = renderHook(() => useEventRepositorySource());

    act(() => refreshEventRepositorySource(true));
    expect(result.current).toBe("remote");

    // No arg → recompute with the last remembered flag (true → remote).
    act(() => refreshEventRepositorySource());
    expect(result.current).toBe("remote");
  });
});
