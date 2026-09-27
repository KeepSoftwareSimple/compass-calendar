import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Z_INDEX_TOOLTIP } from "@web/common/constants/web.constants";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { EDIT_SEQUENCE_LETTER_FIELDS } from "@web/shortcuts/edit-sequence/edit-sequence.fields";
import {
  selectEditSequenceMenuVisible,
  useEditSequenceStore,
} from "@web/shortcuts/edit-sequence/edit-sequence.store";

const MENU_WIDTH = 260;
const GAP = 8;

export interface EditSequenceMenuOption {
  key: string;
  label: string;
}

/** Screen-reader copy, so the visible chips can stay aria-hidden. */
const srText = (prompt: string, options: readonly EditSequenceMenuOption[]) =>
  `${prompt} ${options
    .map(
      (option) =>
        `${option.key.toUpperCase()} for ${option.label.toLowerCase()}`,
    )
    .join(", ")}. Escape to cancel.`;

/** Zero-size reference low in the viewport, used when the anchor is gone or
 * scrolled out of sight. Mirrors the `cursorReference` trick the context menu
 * already uses for click-positioned menus. */
const viewportFallbackReference = () => ({
  getBoundingClientRect: () =>
    new DOMRect(window.innerWidth / 2 - MENU_WIDTH / 2, 0, 0, 0),
});

const isOffscreen = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();
  return (
    rect.width === 0 ||
    rect.height === 0 ||
    rect.bottom <= 0 ||
    rect.right <= 0 ||
    rect.top >= window.innerHeight ||
    rect.left >= window.innerWidth
  );
};

/**
 * The which-key panel for the `e` / `Mod+E` edit leader. Portaled like
 * ShiftHintOverlay so overflow-hidden event cards cannot clip it.
 *
 * Placement is floating-ui's job: `flip` moves the panel above an event near
 * the bottom edge and `shift` keeps it on screen, both measured from the real
 * rendered box, and `autoUpdate` tracks scroll and resize.
 */
export function EditSequenceMenu({
  getAnchor,
}: {
  getAnchor: () => HTMLElement | null;
}) {
  const menuVisible = useEditSequenceStore(selectEditSequenceMenuVisible);
  const isVisible = menuVisible;
  // Read through a ref: the owners rebuild `getAnchor` every render, so using
  // it as an effect dependency would re-seat the reference constantly.
  const getAnchorRef = useRef(getAnchor);
  getAnchorRef.current = getAnchor;

  const { refs, floatingStyles, isPositioned } = useFloating({
    open: isVisible,
    middleware: [offset(GAP), flip(), shift({ padding: GAP })],
    placement: "bottom-start",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
  });

  const { setPositionReference } = refs;
  useEffect(() => {
    if (!isVisible) return;

    const anchor = getAnchorRef.current();
    setPositionReference(
      anchor && !isOffscreen(anchor) ? anchor : viewportFallbackReference(),
    );
  }, [isVisible, setPositionReference]);

  if (!isVisible || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={refs.setFloating}
      className="pointer-events-none"
      data-edit-sequence-menu=""
      style={{
        ...floatingStyles,
        width: MENU_WIDTH,
        zIndex: Z_INDEX_TOOLTIP,
        // Until floating-ui has measured, the panel would sit at 0,0.
        visibility: isPositioned ? "visible" : "hidden",
      }}
    >
      <div
        aria-live="polite"
        // Opaque surface-raised, matching c-context-menu/c-tooltip: this floats
        // over the grid, and surface-overlay is a 7% tint meant to sit on top
        // of an already-opaque panel, so events showed through it.
        className="rounded border border-border bg-surface-raised p-2 shadow-[0_4px_6px_var(--color-shadow-default)]"
        role="status"
      >
        <span className="sr-only">
          {srText("Edit which field?", EDIT_SEQUENCE_LETTER_FIELDS)}
        </span>
        <div aria-hidden className="flex flex-col gap-1">
          <span className="px-0.5 text-text-muted text-xs">
            Edit which field?
          </span>
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {EDIT_SEQUENCE_LETTER_FIELDS.map((option) => (
              <span
                key={option.key}
                className="flex items-center gap-1.5 text-text text-xs"
              >
                <ShortcutHint>{option.key.toUpperCase()}</ShortcutHint>
                <span className="truncate">{option.label}</span>
              </span>
            ))}
          </div>
          <span className="px-0.5 text-text-muted text-xs">Esc to cancel</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
