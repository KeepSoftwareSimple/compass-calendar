import { renderHook } from "@testing-library/react";
import { act } from "react";
import {
  type CollapsiblePanelState,
  useCollapsiblePanel,
} from "./useCollapsiblePanel";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const flushFrames = () => {
  act(() => {
    for (const callback of pendingFrames.splice(0)) {
      callback(0);
    }
  });
};

let pendingFrames: FrameRequestCallback[] = [];
const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

beforeEach(() => {
  pendingFrames = [];
  globalThis.requestAnimationFrame = mock((callback: FrameRequestCallback) => {
    pendingFrames.push(callback);
    return pendingFrames.length;
  }) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = mock();
});

afterEach(() => {
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
});

const fireTransitionEnd = (
  onTransitionEnd: CollapsiblePanelState["onTransitionEnd"],
  overrides: Partial<{ propertyName: string; sameTarget: boolean }> = {},
) => {
  const target = {};
  const { propertyName = "width", sameTarget = true } = overrides;

  act(() => {
    onTransitionEnd({
      currentTarget: target,
      propertyName,
      target: sameTarget ? target : {},
    } as never);
  });
};

describe("useCollapsiblePanel", () => {
  it("starts expanded with no entrance animation when it opens on first mount", () => {
    const { result } = renderHook(() => useCollapsiblePanel(true));

    expect(result.current.isMounted).toBe(true);
    expect(result.current.isExpanded).toBe(true);
  });

  it("starts unmounted when it opens closed on first mount", () => {
    const { result } = renderHook(() => useCollapsiblePanel(false));

    expect(result.current.isMounted).toBe(false);
    expect(result.current.isExpanded).toBe(false);
  });

  it("mounts immediately and expands on the next frame when opening later", () => {
    const { rerender, result } = renderHook(
      ({ isOpen }) => useCollapsiblePanel(isOpen),
      { initialProps: { isOpen: false } },
    );

    rerender({ isOpen: true });

    expect(result.current.isMounted).toBe(true);
    expect(result.current.isExpanded).toBe(false);

    flushFrames();

    expect(result.current.isExpanded).toBe(true);
  });

  it("collapses immediately but stays mounted until the width transition ends", () => {
    const { rerender, result } = renderHook(
      ({ isOpen }) => useCollapsiblePanel(isOpen),
      { initialProps: { isOpen: true } },
    );

    rerender({ isOpen: false });

    expect(result.current.isExpanded).toBe(false);
    expect(result.current.isMounted).toBe(true);

    fireTransitionEnd(result.current.onTransitionEnd);

    expect(result.current.isMounted).toBe(false);
  });

  it("ignores bubbled transitionend events from other properties or children", () => {
    const { rerender, result } = renderHook(
      ({ isOpen }) => useCollapsiblePanel(isOpen),
      { initialProps: { isOpen: true } },
    );

    rerender({ isOpen: false });

    fireTransitionEnd(result.current.onTransitionEnd, {
      propertyName: "opacity",
    });
    expect(result.current.isMounted).toBe(true);

    fireTransitionEnd(result.current.onTransitionEnd, { sameTarget: false });
    expect(result.current.isMounted).toBe(true);

    fireTransitionEnd(result.current.onTransitionEnd);
    expect(result.current.isMounted).toBe(false);
  });

  it("does not unmount from a stale transitionend after reopening", () => {
    const { rerender, result } = renderHook(
      ({ isOpen }) => useCollapsiblePanel(isOpen),
      { initialProps: { isOpen: true } },
    );

    rerender({ isOpen: false });
    rerender({ isOpen: true });
    flushFrames();

    // A transitionend that fires late from the earlier close should not
    // unmount a panel that has since reopened.
    fireTransitionEnd(result.current.onTransitionEnd);

    expect(result.current.isMounted).toBe(true);
    expect(result.current.isExpanded).toBe(true);
  });
});
