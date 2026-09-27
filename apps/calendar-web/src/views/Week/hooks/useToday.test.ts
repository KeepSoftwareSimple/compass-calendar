import { renderHook } from "@testing-library/react";
import { act } from "react";
import { setPinnedTimeZone } from "@web/timezone/effective-timezone.store";
import { useToday } from "@web/views/Week/hooks/useToday";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
  spyOn,
} from "bun:test";

describe("useToday", () => {
  let timeoutCallback: (() => void) | undefined;
  let setTimeoutSpy: ReturnType<typeof spyOn>;
  let clearTimeoutSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    setSystemTime(new Date("2026-02-05T23:59:00.000Z"));
    timeoutCallback = undefined;
    setTimeoutSpy = spyOn(globalThis, "setTimeout").mockImplementation(((
      callback: TimerHandler,
    ) => {
      if (typeof callback === "function") {
        timeoutCallback = () => callback();
      }

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
  });

  it("keeps the same `today` reference across a tick within the same day", () => {
    const { result } = renderHook(() => useToday());
    const initialToday = result.current.today;

    setSystemTime(new Date("2026-02-05T23:59:30.000Z"));
    act(() => {
      timeoutCallback?.();
    });

    expect(result.current.today).toBe(initialToday);
  });

  it("swaps `today` once the day rolls over on a tick", () => {
    const { result } = renderHook(() => useToday());

    setSystemTime(new Date("2026-02-06T00:01:00.000Z"));
    act(() => {
      timeoutCallback?.();
    });

    expect(result.current.today.isSame("2026-02-06", "day")).toBe(true);
    expect(result.current.todayIndex).toBe(result.current.today.get("day"));
  });

  it("uses the pinned timezone for the calendar day", () => {
    setSystemTime(new Date("2026-02-06T01:00:00.000Z"));
    act(() => {
      setPinnedTimeZone("America/Denver");
    });

    const { result } = renderHook(() => useToday());

    expect(result.current.today.format("YYYY-MM-DD")).toBe("2026-02-05");
  });
});
