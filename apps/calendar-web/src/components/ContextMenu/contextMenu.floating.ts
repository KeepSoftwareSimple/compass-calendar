import {
  autoUpdate,
  flip,
  offset,
  shift,
  type UseFloatingOptions,
} from "@floating-ui/react";
import { type CSSProperties } from "react";
import { Z_INDEX_FLOATING_MENU } from "@web/common/constants/web.constants";

/**
 * How both grids anchor their event context menu. The reference is a virtual
 * element at the click's viewport coordinates and the menu is portalled out
 * of the scrolling grid, so it positions against the viewport rather than an
 * offset parent - which also means it needs no repositioning on scroll.
 */
export const CONTEXT_MENU_FLOATING_OPTIONS: Pick<
  UseFloatingOptions,
  "middleware" | "placement" | "strategy" | "whileElementsMounted"
> = {
  middleware: [offset(5), flip(), shift()],
  placement: "right-start",
  strategy: "fixed",
  whileElementsMounted: autoUpdate,
};

/** A zero-size reference at the cursor, so the menu opens where they clicked. */
export const cursorReference = (clientX: number, clientY: number) => ({
  getBoundingClientRect: () => new DOMRect(clientX, clientY, 0, 0),
});

/** Near the card's top center, the same point `m` and Shift+F10 share. */
export function cardContextMenuPoint(rect: DOMRectReadOnly): {
  clientX: number;
  clientY: number;
} {
  return {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + Math.min(rect.height / 2, 24),
  };
}

/**
 * Pointer click uses the cursor. Shift+F10 / the Menu key fire at 0,0, so
 * those land on the card instead of the viewport corner.
 */
export function contextMenuAnchorFromPointer(
  event: Pick<MouseEvent, "clientX" | "clientY">,
  target: HTMLElement,
): { reference: ReturnType<typeof cursorReference>; fromKeyboard: boolean } {
  const fromKeyboard = event.clientX === 0 && event.clientY === 0;
  if (fromKeyboard) {
    const card = target.closest("button") ?? target;
    const { clientX, clientY } = cardContextMenuPoint(
      card.getBoundingClientRect(),
    );
    return { reference: cursorReference(clientX, clientY), fromKeyboard };
  }
  return {
    reference: cursorReference(event.clientX, event.clientY),
    fromKeyboard,
  };
}

/**
 * Rendered inline, the menu shares a stacking context with the event cards
 * and loses to any card stacked above it, so it carries the same z-index as
 * the app's other floating menus and is portalled out.
 */
export const contextMenuStyle = (
  floatingStyles: CSSProperties,
): CSSProperties => ({
  ...floatingStyles,
  zIndex: Z_INDEX_FLOATING_MENU,
});
