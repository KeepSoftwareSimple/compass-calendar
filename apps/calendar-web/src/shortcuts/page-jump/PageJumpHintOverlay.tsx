import {
  type DigitHintChip,
  DigitHintChipOverlay,
} from "@web/shortcuts/hint-chips/DigitHintChipOverlay";
import { usePageJumpHintStore } from "@web/shortcuts/page-jump/page-jump.store";
import {
  CALENDAR_PAGE_JUMP_TARGETS,
  getPageJumpChipAnchor,
  getPageJumpFocusElement,
  type PageJumpTargets,
} from "@web/shortcuts/page-jump/page-jump.targets";

/**
 * Numbered keycap chips anchored to each page jump target while Mod is held
 * (see usePageJumpShortcut), or on a single target while the pointer hovers
 * it, so the shortcut can be discovered without the keyboard.
 */
export function PageJumpHintOverlay({
  visible,
  targets = CALENDAR_PAGE_JUMP_TARGETS,
}: {
  visible: boolean;
  targets?: PageJumpTargets;
}) {
  const hoveredTargetId = usePageJumpHintStore((s) => s.hoveredTargetId);
  // Only targets that would actually take focus get announced or chipped —
  // e.g. a collapsed sidebar unmounts the month picker, and an empty Up Next
  // card has nothing focusable, so their digits would do nothing there.
  const resolveChips = (): DigitHintChip[] =>
    targets.flatMap((target) => {
      // Hovering one target chips only that target; holding Mod chips all.
      if (!visible && target.id !== hoveredTargetId) return [];
      if (!getPageJumpFocusElement(target.id)) return [];
      const anchor = getPageJumpChipAnchor(target.id);
      if (!anchor) return [];
      return [
        { key: target.id, digit: target.digit, label: target.label, anchor },
      ];
    });

  return (
    <DigitHintChipOverlay
      resolveChips={resolveChips}
      rootAttribute="data-page-jump-hints"
      srPrompt="Jump to?"
      visible={visible || hoveredTargetId !== null}
    />
  );
}
