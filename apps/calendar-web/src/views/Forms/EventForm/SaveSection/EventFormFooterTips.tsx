import { useEffect, useMemo } from "react";
import { buildTieredEventFormFooterTips } from "@core/shortcuts/event-form-footer-tips";
import {
  selectFirstEventCelebrating,
  selectFirstEventDone,
  useFirstEventPromptStore,
} from "@web/components/FirstEventPrompt/first-event.store";
import { useDatePickerHintStore } from "@web/shortcuts/tips/date-picker-hint.store";
import {
  selectEventFormFocusInside,
  selectEventFormTabNavigationApplies,
  useEventFormFocusStore,
} from "@web/shortcuts/tips/event-form-focus.store";
import { ProgressiveShortcutTipParts } from "@web/shortcuts/tips/ProgressiveShortcutTipParts";
import {
  getShortcutHint,
  type ShortcutTipPart,
} from "@web/shortcuts/tips/shortcut-tips.data";
import { useIsTipsMuted } from "@web/shortcuts/tips/shortcut-tips-muted.store";
import { visibleShortcutHintActions } from "@web/shortcuts/tips/visible-shortcut-hint.store";

type FooterHint =
  | { id: "first-event-save"; parts: readonly ShortcutTipPart[] }
  | {
      id: "save-draft";
      primary: readonly ShortcutTipPart[];
      secondary: readonly ShortcutTipPart[];
    };

/** Context-aware keyboard tips pinned under the Save bar in the event form. */
export function EventFormFooterTips() {
  const tipsMuted = useIsTipsMuted();
  const focusInsideForm = useEventFormFocusStore(selectEventFormFocusInside);
  const tabNavigationApplies = useEventFormFocusStore(
    selectEventFormTabNavigationApplies,
  );
  const datePickerHintActive = useDatePickerHintStore(
    (s) => s.stack.length > 0,
  );
  const firstEventDone = useFirstEventPromptStore(selectFirstEventDone);
  const isCelebrating = useFirstEventPromptStore(selectFirstEventCelebrating);

  const hint = useMemo((): FooterHint | null => {
    if (tipsMuted || !focusInsideForm) return null;
    if (!firstEventDone && !isCelebrating) {
      const first = getShortcutHint("first-event-save");
      return { id: "first-event-save", parts: first.parts };
    }
    const tiered = buildTieredEventFormFooterTips({
      focusInsideForm,
      tabNavigationApplies,
      datePickerHintActive,
    });
    if (tiered.primary.length === 0 && tiered.secondary.length === 0) {
      return null;
    }
    return {
      id: "save-draft",
      primary: tiered.primary,
      secondary: tiered.secondary,
    };
  }, [
    datePickerHintActive,
    firstEventDone,
    focusInsideForm,
    isCelebrating,
    tabNavigationApplies,
    tipsMuted,
  ]);

  useEffect(() => {
    if (!hint) {
      visibleShortcutHintActions.clearFormFooterHint();
      return;
    }
    const allParts =
      hint.id === "first-event-save"
        ? hint.parts
        : [...hint.primary, ...hint.secondary];
    visibleShortcutHintActions.setFormFooterHint({
      id: hint.id,
      parts: allParts,
    });
    return () => visibleShortcutHintActions.clearFormFooterHint();
  }, [hint]);

  if (!hint) return null;

  return (
    <p
      aria-live="polite"
      className="flex min-h-10 w-full items-center justify-center text-pretty break-words text-center text-text-muted text-xs leading-5 opacity-80"
      data-testid="event-form-footer-tips"
    >
      {hint.id === "first-event-save" ? (
        <ProgressiveShortcutTipParts hintId={hint.id} primary={hint.parts} />
      ) : (
        <ProgressiveShortcutTipParts
          hintId={hint.id}
          primary={hint.primary}
          secondary={hint.secondary}
        />
      )}
    </p>
  );
}
