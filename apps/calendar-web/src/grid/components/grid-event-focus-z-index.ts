import { ZIndex } from "@web/common/constants/web.constants";

/**
 * Paint order while a grid event card is keyboard-focused. Timed overlap
 * partners, later sequential cards in the same column, and the now line
 * (LAYER_2) otherwise paint over the focus outline; raising the focused card
 * keeps the ring fully visible without moving its box.
 */
export function withGridEventKeyboardFocusZIndex(
  stackZIndex: number,
  isKeyboardFocused: boolean,
): number {
  return isKeyboardFocused ? ZIndex.MAX : stackZIndex;
}
