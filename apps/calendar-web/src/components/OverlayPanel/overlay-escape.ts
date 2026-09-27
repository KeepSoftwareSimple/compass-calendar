import { useEffect, useRef } from "react";
import { isFloatingLayerOpen } from "@web/shortcuts/floating-layer";

type OverlayEscapeHandlers = {
  onDismiss?: () => void;
  onShiftEscape?: () => void;
};

const stack: OverlayEscapeHandlers[] = [];
let listening = false;

const onDocumentKeyDown = (event: KeyboardEvent) => {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  // Listboxes and menus peel first. A document listener that closed the
  // overlay underneath them would skip a layer.
  if (isFloatingLayerOpen()) return;

  const top = stack[stack.length - 1];
  if (!top) return;

  if (event.shiftKey && top.onShiftEscape) {
    event.preventDefault();
    event.stopPropagation();
    top.onShiftEscape();
    return;
  }

  if (top.onDismiss) {
    event.preventDefault();
    event.stopPropagation();
    top.onDismiss();
  }
};

const ensureListener = () => {
  if (listening) return;
  listening = true;
  document.addEventListener("keydown", onDocumentKeyDown);
};

const releaseListener = () => {
  if (stack.length > 0 || !listening) return;
  listening = false;
  document.removeEventListener("keydown", onDocumentKeyDown);
};

/**
 * Document-level Escape for OverlayPanel. Last-in-wins so stacked panels peel
 * one at a time, and the listener does not depend on focus sitting inside the
 * overlay (React onKeyDown on the backdrop misses Escape when focus is on
 * document.body). In-tree keydowns still go through OverlayPanel's React
 * handler, which preventDefaults so this listener does not double-fire.
 *
 * Panels that omit `onDismiss` (the billing gate) never join the stack.
 */
export function useOverlayEscape({
  onDismiss,
  onShiftEscape,
}: OverlayEscapeHandlers) {
  const handlersRef = useRef({ onDismiss, onShiftEscape });
  handlersRef.current = { onDismiss, onShiftEscape };

  const enabled = Boolean(onDismiss || onShiftEscape);

  useEffect(() => {
    if (!enabled) return;

    const entry: OverlayEscapeHandlers = {
      get onDismiss() {
        return handlersRef.current.onDismiss;
      },
      get onShiftEscape() {
        return handlersRef.current.onShiftEscape;
      },
    };
    stack.push(entry);
    ensureListener();

    return () => {
      const index = stack.lastIndexOf(entry);
      if (index >= 0) stack.splice(index, 1);
      releaseListener();
    };
  }, [enabled]);
}

/** True when an OverlayPanel is registered to peel Escape before lower owners. */
export function isOverlayEscapeArmed(): boolean {
  return stack.length > 0;
}

/** Test-only: drop every registered overlay so cases cannot leak a listener. */
export function clearOverlayEscapeStack() {
  stack.length = 0;
  releaseListener();
}
