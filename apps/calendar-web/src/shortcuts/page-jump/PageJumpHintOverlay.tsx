import {
  type DigitHintChip,
  DigitHintChipOverlay,
} from "@web/shortcuts/hint-chips/DigitHintChipOverlay";
import {
  CALENDAR_PAGE_JUMP_TARGETS,
  getPageJumpAnchor,
  getPageJumpFocusElement,
  type PageJumpTargets,
} from "@web/shortcuts/page-jump/page-jump.targets";

/**
 * Numbered keycap chips anchored to each page jump target while Mod is held
 * (see usePageJumpShortcut).
 */
export function PageJumpHintOverlay({
  visible,
  targets = CALENDAR_PAGE_JUMP_TARGETS,
}: {
  visible: boolean;
  targets?: PageJumpTargets;
}) {
  // Only targets that would actually take focus get announced or chipped —
  // e.g. a collapsed sidebar unmounts the month picker, and an empty Up Next
  // card has nothing focusable, so their digits would do nothing there.
  const resolveChips = (): DigitHintChip[] =>
    targets.flatMap((target) => {
      const anchor = getPageJumpAnchor(target.id);
      if (!anchor || !getPageJumpFocusElement(target.id)) return [];
      return [
        { key: target.id, digit: target.digit, label: target.label, anchor },
      ];
    });

  return (
    <DigitHintChipOverlay
      resolveChips={resolveChips}
      rootAttribute="data-page-jump-hints"
      srPrompt="Jump to?"
      visible={visible}
    />
  );
}
