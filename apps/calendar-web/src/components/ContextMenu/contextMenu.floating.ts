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
