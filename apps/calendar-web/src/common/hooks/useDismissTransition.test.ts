import { act, renderHook } from "@testing-library/react";
import { useDismissTransition } from "@web/common/hooks/useDismissTransition";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

describe("useDismissTransition", () => {
  let timeoutCallback: (() => void) | undefined;
  let setTimeoutSpy: ReturnType<typeof spyOn>;
  let clearTimeoutSpy: ReturnType<typeof spyOn>;
  const originalMatchMedia = window.matchMedia;

  const installMatchMediaMock = (
    matches: boolean | ((query: string) => boolean) = false,
  ) => {
    window.matchMedia = mock((query: string) => ({
      matches: typeof matches === "function" ? matches(query) : matches,
      media: query,
      onchange: null,
      addListener: mock(),
      removeListener: mock(),
      addEventListener: mock(),
      removeEventListener: mock(),
      dispatchEvent: mock(() => false),
    })) as typeof window.matchMedia;
  };

  beforeEach(() => {
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
    installMatchMediaMock();
  });

  afterEach(() => {
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
    window.matchMedia = originalMatchMedia;
  });

  it("sets closing and calls onComplete after the duration", () => {
    const onComplete = mock(() => {});
    const { result } = renderHook(() => useDismissTransition(300));

    expect(result.current.closing).toBe(false);

    act(() => {
      expect(result.current.beginDismiss(onComplete)).toBe(true);
    });

    expect(result.current.closing).toBe(true);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 300);
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      timeoutCallback?.();
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(result.current.closing).toBe(false);
  });

  it("skips the delay when reduced motion is preferred", () => {
    installMatchMediaMock((query) => query.includes("prefers-reduced-motion"));

    const onComplete = mock(() => {});
    const { result } = renderHook(() => useDismissTransition(400));

    act(() => {
      result.current.beginDismiss(onComplete);
    });

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 0);
  });

  it("ignores a second beginDismiss while already closing", () => {
    const first = mock(() => {});
    const second = mock(() => {});
    const { result } = renderHook(() => useDismissTransition(300));

    act(() => {
      expect(result.current.beginDismiss(first)).toBe(true);
      expect(result.current.beginDismiss(second)).toBe(false);
    });

    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it("cancelDismiss aborts the fade without calling onComplete", () => {
    const onComplete = mock(() => {});
    const { result } = renderHook(() => useDismissTransition(300));

    act(() => {
      result.current.beginDismiss(onComplete);
    });
    expect(result.current.closing).toBe(true);

    act(() => {
      result.current.cancelDismiss();
    });

    expect(result.current.closing).toBe(false);
    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("keeps the same cancelDismiss identity across re-renders", () => {
    const { result, rerender } = renderHook(() => useDismissTransition(300));
    const first = result.current.cancelDismiss;

    rerender();

    expect(result.current.cancelDismiss).toBe(first);
  });

  it("clears the pending timer on unmount", () => {
    const { result, unmount } = renderHook(() => useDismissTransition(300));

    act(() => {
      result.current.beginDismiss(() => {});
    });

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps the same beginDismiss identity across re-renders", () => {
    // A caller may key a useEffect on `beginDismiss` (e.g. "schedule a
    // dismiss once, when some condition first becomes true"). A fresh
    // function identity on every unrelated re-render would restart that
    // effect's timer indefinitely.
    const { result, rerender } = renderHook(() => useDismissTransition(300));
    const first = result.current.beginDismiss;

    rerender();

    expect(result.current.beginDismiss).toBe(first);
  });
});
