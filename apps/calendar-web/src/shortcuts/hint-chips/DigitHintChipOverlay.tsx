import { createPortal } from "react-dom";
import { Z_INDEX_TOOLTIP } from "@web/common/constants/web.constants";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { getVisibleHintRect } from "@web/shortcuts/shift-hint/shift-hint-visible-rect";
import { useHintLayoutRefresh } from "@web/shortcuts/useHintLayoutRefresh";

/** One numbered target: the key to press and the element to chip. */
export type DigitHintChip = {
  /** Stable React key, unique within one overlay. */
  key: string;
  digit: string;
  label: string;
  anchor: HTMLElement;
};

/** Widest a single-character keycap gets, used to keep chips on screen. */
const CHIP_WIDTH_PX = 22;

/**
 * Numbered keycap chips anchored to each target while Mod is held, shared by
 * the page-jump, event-form, and sign-up digit overlays. Portaled to the body
 * so a scroll container or an overflow-hidden card cannot clip a chip on a
 * target near its edge.
 *
 * `resolveChips` runs only while visible, and on every layout refresh, because
 * it reads the live DOM: which targets are mounted changes with the view, and
 * their rects change as the user scrolls.
 */
export function DigitHintChipOverlay({
  visible,
  resolveChips,
  srPrompt,
  rootAttribute,
}: {
  visible: boolean;
  resolveChips: () => DigitHintChip[];
  /** Leads the screen-reader announcement, e.g. "Jump to?". */
  srPrompt: string;
  /** `data-*` attribute marking the portal root for tests and e2e. */
  rootAttribute: string;
}) {
  useHintLayoutRefresh(visible);

  if (!visible || typeof document === "undefined") {
    return null;
  }

  const chips = resolveChips();
  if (chips.length === 0) {
    return null;
  }

  const srText = `${srPrompt} ${chips
    .map((chip) => `${chip.digit} for ${chip.label.toLowerCase()}`)
    .join(", ")}. Release the modifier to dismiss.`;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: Z_INDEX_TOOLTIP }}
      {...{ [rootAttribute]: "" }}
    >
      <span aria-live="polite" className="sr-only" role="status">
        {srText}
      </span>
      <div aria-hidden>
        {chips.map((chip) => {
          const visibleRect = getVisibleHintRect(chip.anchor);
          if (!visibleRect) {
            // Scrolled out of view; the shortcut still works, but a
            // portaled chip with nothing to anchor to would float in place.
            return null;
          }

          return (
            <span
              key={chip.key}
              className="absolute"
              style={{
                top: visibleRect.top + 2,
                left: Math.max(4, visibleRect.right - CHIP_WIDTH_PX),
              }}
            >
              <ShortcutHint>{chip.digit}</ShortcutHint>
            </span>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
