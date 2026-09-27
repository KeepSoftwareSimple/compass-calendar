import { act, renderHook } from "@testing-library/react";
import {
  clearFloatingLayerReasons,
  isFloatingLayerOpen,
  setFloatingLayerReason,
  useFloatingLayer,
} from "@web/shortcuts/floating-layer";
import { afterEach, describe, expect, it } from "bun:test";

afterEach(() => {
  clearFloatingLayerReasons();
});

describe("floating-layer", () => {
  it("tracks named reasons without clearing siblings", () => {
    expect(isFloatingLayerOpen()).toBe(false);

    setFloatingLayerReason("a", true);
    expect(isFloatingLayerOpen()).toBe(true);

    setFloatingLayerReason("b", true);
    setFloatingLayerReason("a", false);
    expect(isFloatingLayerOpen()).toBe(true);

    setFloatingLayerReason("b", false);
    expect(isFloatingLayerOpen()).toBe(false);
  });

  it("useFloatingLayer syncs with open and cleans up on unmount", () => {
    const { rerender, unmount } = renderHook(
      ({ open }) => useFloatingLayer("hook", open),
      { initialProps: { open: true } },
    );

    expect(isFloatingLayerOpen()).toBe(true);

    act(() => {
      rerender({ open: false });
    });
    expect(isFloatingLayerOpen()).toBe(false);

    act(() => {
      rerender({ open: true });
    });
    expect(isFloatingLayerOpen()).toBe(true);

    unmount();
    expect(isFloatingLayerOpen()).toBe(false);
  });
});
