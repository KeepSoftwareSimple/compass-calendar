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
