import { type MouseEvent as ReactMouseEvent } from "react";

/**
 * Whether a click came from the pointer rather than keyboard activation.
 * Enter or Space on a button fires a click too, with `detail === 0`, and
 * teaching a shortcut to someone who just used the keyboard is noise.
 */
export function isRealMouseClick(
  event: Pick<ReactMouseEvent, "detail" | "nativeEvent">,
): boolean {
  return event.detail > 0 && event.nativeEvent instanceof MouseEvent;
}
