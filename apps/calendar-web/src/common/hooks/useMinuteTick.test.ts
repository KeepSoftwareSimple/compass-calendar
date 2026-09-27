import { renderHook } from "@testing-library/react";
import { act } from "react";
import {
  msUntilNextMinute,
  useMinuteTick,
} from "@web/common/hooks/useMinuteTick";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
  spyOn,
} from "bun:test";

describe("msUntilNextMinute", () => {
  it("waits a full minute when already on a minute boundary", () => {
    expect(msUntilNextMinute(Date.parse("2026-02-05T00:00:00.000Z"))).toBe(
      60_000,
    );
  });

  it("waits the remainder of the current minute", () => {
    expect(msUntilNextMinute(Date.parse("2026-02-05T00:00:37.000Z"))).toBe(
      23_000,
    );
  });
});

describe("useMinuteTick", () => {
  let timeoutCallback: (() => void) | undefined;
  let lastDelay: number | undefined;
  let setTimeoutSpy: ReturnType<typeof spyOn>;
  let clearTimeoutSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    setSystemTime(new Date("2026-02-05T00:00:00.000Z"));
    timeoutCallback = undefined;
    lastDelay = undefined;
    setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(((
      callback: TimerHandler,
      delay?: number,
    ) => {
      if (typeof callback === "function") {
        timeoutCallback = () => callback();
      }
      lastDelay = delay;
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);
    clearTimeoutSpy = spyOn(globalThis, "clearTimeout").mockImplementation(
      () => {},
    );
  });

  afterEach(() => {
    setSystemTime();
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  it("returns the current time on mount", () => {
    const { result } = renderHook(() => useMinuteTick());

    expect(result.current.toISOString()).toBe("2026-02-05T00:00:00.000Z");
  });

  it("schedules the first tick for the next clock minute", () => {
    setSystemTime(new Date("2026-02-05T00:00:37.000Z"));
    renderHook(() => useMinuteTick());

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 23_000);
  });

  it("advances once per minute-tick without changing more often", () => {
    const { result } = renderHook(() => useMinuteTick());

    expect(lastDelay).toBe(60_000);

    setSystemTime(new Date("2026-02-05T00:01:00.000Z"));
    act(() => {
      timeoutCallback?.();
    });

    expect(result.current.toISOString()).toBe("2026-02-05T00:01:00.000Z");
  });

  it("catches up when the tab becomes visible", () => {
    const { result } = renderHook(() => useMinuteTick());

    setSystemTime(new Date("2026-02-05T00:04:00.000Z"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.toISOString()).toBe("2026-02-05T00:04:00.000Z");
  });

  it("does not catch up while the tab is hidden", () => {
    const { result } = renderHook(() => useMinuteTick());
    const mountedAt = result.current.toISOString();

    setSystemTime(new Date("2026-02-05T00:04:00.000Z"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current.toISOString()).toBe(mountedAt);
  });

  it("catches up when the window is focused", () => {
    const { result } = renderHook(() => useMinuteTick());

    setSystemTime(new Date("2026-02-05T00:04:00.000Z"));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(result.current.toISOString()).toBe("2026-02-05T00:04:00.000Z");
  });

  it("stops ticking after unmount", () => {
    const { unmount } = renderHook(() => useMinuteTick());

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
