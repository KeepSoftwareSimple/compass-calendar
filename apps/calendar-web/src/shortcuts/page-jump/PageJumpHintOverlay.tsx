import { createPortal } from "react-dom";
import { Z_INDEX_TOOLTIP } from "@web/common/constants/web.constants";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import {
  CALENDAR_PAGE_JUMP_TARGETS,
  getPageJumpAnchor,
  getPageJumpFocusElement,
  type PageJumpTargets,
} from "@web/shortcuts/page-jump/page-jump.targets";
import { getVisibleHintRect } from "@web/shortcuts/shift-hint/shift-hint-visible-rect";
import { useHintLayoutRefresh } from "@web/shortcuts/useHintLayoutRefresh";

/**
 * Numbered keycap chips anchored to each page jump target while Mod is held
 * (see usePageJumpShortcut). Portaled like FormDigitHintOverlay so scroll
 * containers cannot clip a chip on a target near their edge.
 */
export function PageJumpHintOverlay({
  visible,
  targets = CALENDAR_PAGE_JUMP_TARGETS,
}: {
  visible: boolean;
  targets?: PageJumpTargets;
}) {
  useHintLayoutRefresh(visible);

  if (!visible || typeof document === "undefined") {
    return null;
  }

  // Only targets that would actually take focus get announced or chipped —
  // e.g. a collapsed sidebar unmounts the month picker, and an empty Up Next
  // card has nothing focusable, so their digits would do nothing there.
  const presentTargets = targets.flatMap((target) => {
    const anchor = getPageJumpAnchor(target.id);
    if (!anchor || !getPageJumpFocusElement(target.id)) return [];
    return [{ ...target, anchor }];
  });

  if (presentTargets.length === 0) {
    return null;
  }

  const srText = `Jump to? ${presentTargets
    .map((target) => `${target.digit} for ${target.label.toLowerCase()}`)
    .join(", ")}. Release the modifier to dismiss.`;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0"
      data-page-jump-hints=""
      style={{ zIndex: Z_INDEX_TOOLTIP }}
    >
      <span aria-live="polite" className="sr-only" role="status">
        {srText}
      </span>
      <div aria-hidden>
        {presentTargets.map((target) => {
          const visibleRect = getVisibleHintRect(target.anchor);
          if (!visibleRect) {
            // Scrolled out of view; the shortcut still works, but a
            // portaled chip with nothing to anchor to would float in place.
            return null;
          }

          const chipWidth = 22;

          return (
            <span
              key={target.id}
              className="absolute"
              style={{
                top: visibleRect.top + 2,
                left: Math.max(4, visibleRect.right - chipWidth),
              }}
            >
              <ShortcutHint>{target.digit}</ShortcutHint>
            </span>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
