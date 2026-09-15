import {
  selectIsEventFormOpen,
  useDraftStore,
} from "@web/events/stores/draft.store";
import { physicalDigitIndex } from "@web/shortcuts/digit-pick.util";
import { useModHoldHintShortcut } from "@web/shortcuts/mod-hold/useModHoldHintShortcut";
import { pageJumpHintActions } from "@web/shortcuts/page-jump/page-jump.store";
import {
  CALENDAR_PAGE_JUMP_TARGETS,
  focusPageJumpTarget,
  type PageJumpTargets,
} from "@web/shortcuts/page-jump/page-jump.targets";
import { recordHandledShortcutInvocation } from "@web/shortcuts/tips/shortcut-telemetry";
import { shortcutHintProgressActions } from "@web/shortcuts/tips/shortcut-tips.progress.store";

/**
 * Mod+digit jumps focus to a page area (see the `targets` list); holding Mod
 * alone reveals the digits via the shared hold-Mod engine.
 *
 * Disabled while the event form is open: the form's own Mod+digit field
 * jumps (useFormDigitJumpShortcut) own the gesture then, so the two digit
 * maps never overlap.
 */
export function usePageJumpShortcut(
  targets: PageJumpTargets = CALENDAR_PAGE_JUMP_TARGETS,
): { areHintsVisible: boolean } {
  const isEventFormOpen = useDraftStore(selectIsEventFormOpen);

  return useModHoldHintShortcut({
    enabled: !isEventFormOpen,
    onHintsRevealed: () => shortcutHintProgressActions.demonstrate("page-jump"),
    onVisibilityChange: pageJumpHintActions.setHintsVisible,
    onModChord: (event) => {
      const index = physicalDigitIndex(event);
      const target = index !== null ? targets[index] : undefined;
      if (!target) return false;
      const focused = focusPageJumpTarget(target.id);
      if (focused) recordHandledShortcutInvocation("focus-page-jump");
      return focused;
    },
  });
}
