import { ZIndex } from "@web/common/constants/web.constants";
import { withGridEventKeyboardFocusZIndex } from "@web/grid/components/grid-event-focus-z-index";
import { describe, expect, it } from "bun:test";

describe("withGridEventKeyboardFocusZIndex", () => {
  it("raises the stack z-index to MAX while keyboard-focused", () => {
    expect(withGridEventKeyboardFocusZIndex(ZIndex.LAYER_1, true)).toBe(
      ZIndex.MAX,
    );
    expect(withGridEventKeyboardFocusZIndex(4, true)).toBe(ZIndex.MAX);
  });

  it("leaves the stack z-index unchanged when not focused", () => {
    expect(withGridEventKeyboardFocusZIndex(ZIndex.LAYER_1, false)).toBe(
      ZIndex.LAYER_1,
    );
    expect(withGridEventKeyboardFocusZIndex(4, false)).toBe(4);
  });
});
