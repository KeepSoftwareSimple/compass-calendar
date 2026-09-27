import { renderHook } from "@testing-library/react";
import { act } from "react";
import { useVisibleAfterHidden } from "@web/common/hooks/useVisibleAfterHidden";
import {
  afterEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
  spyOn,
} from "bun:test";

const THRESHOLD_MS = 30_000;

describe("useVisibleAfterHidden", () => {
  let visibilityState = "visible";

  const setVisibility = (state: "visible" | "hidden") => {
    visibilityState = state;
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  };

  const reset = () => {
    visibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });
    setSystemTime(new Date("2026-02-05T00:00:00.000Z"));
  };

  afterEach(() => {
    setSystemTime();
  });

  it("calls onVisible when the tab is hidden long enough before returning", () => {
    reset();
    const onVisible = mock();
    renderHook(() => useVisibleAfterHidden(onVisible, THRESHOLD_MS));

    act(() => {
      setVisibility("hidden");
      setSystemTime(new Date(Date.now() + THRESHOLD_MS + 1_000));
      setVisibility("visible");
    });

    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  it("does not call onVisible for a hide shorter than the threshold", () => {
    reset();
    const onVisible = mock();
    renderHook(() => useVisibleAfterHidden(onVisible, THRESHOLD_MS));

    act(() => {
      setVisibility("hidden");
      setSystemTime(new Date(Date.now() + THRESHOLD_MS - 1_000));
      setVisibility("visible");
    });

    expect(onVisible).not.toHaveBeenCalled();
  });

  it("does not install a listener when disabled", () => {
    reset();
    const addEventListenerSpy = spyOn(document, "addEventListener");

    renderHook(() => useVisibleAfterHidden(mock(), THRESHOLD_MS, false));

    expect(
      addEventListenerSpy.mock.calls.some(
        ([eventName]) => eventName === "visibilitychange",
      ),
    ).toBe(false);

    addEventListenerSpy.mockRestore();
  });

  it("removes the listener on unmount", () => {
    reset();
    const addEventListenerSpy = spyOn(document, "addEventListener");
    const removeEventListenerSpy = spyOn(document, "removeEventListener");

    const { unmount } = renderHook(() =>
      useVisibleAfterHidden(mock(), THRESHOLD_MS),
    );
    const handler = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === "visibilitychange",
    )?.[1];

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "visibilitychange",
      handler,
    );

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it("always calls the latest onVisible, not a stale closure from mount", () => {
    reset();
    const first = mock();
    const second = mock();
    const { rerender } = renderHook(
      ({ onVisible }) => useVisibleAfterHidden(onVisible, THRESHOLD_MS),
      { initialProps: { onVisible: first } },
    );

    rerender({ onVisible: second });

    act(() => {
      setVisibility("hidden");
      setSystemTime(new Date(Date.now() + THRESHOLD_MS + 1_000));
      setVisibility("visible");
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
