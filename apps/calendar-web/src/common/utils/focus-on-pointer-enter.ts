import { type PointerEvent } from "react";
import { isEditableKeyboardTarget } from "@web/common/utils/form/form.util";

/**
 * Seats focus on the hovered control so Enter activates that element rather
 * than whichever sibling was focused on open. Touch/pen are skipped: those
 * already activate on tap, and a focus move would steal from the real target.
 * Text fields keep focus: hovering Cancel while typing must not make Enter
 * dismiss the dialog.
 */
export const focusOnPointerEnter = (event: PointerEvent<HTMLElement>): void => {
  if (event.pointerType !== "mouse") return;
  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    active !== event.currentTarget &&
    isEditableKeyboardTarget({ target: active })
  ) {
    return;
  }
  event.currentTarget.focus({ preventScroll: true });
};
