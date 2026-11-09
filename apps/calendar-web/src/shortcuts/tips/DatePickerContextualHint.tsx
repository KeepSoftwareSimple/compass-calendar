import { type FC, useEffect } from "react";
import { useDatePickerHintStore } from "@web/shortcuts/tips/date-picker-hint.store";
import { ProgressiveShortcutTipParts } from "@web/shortcuts/tips/ProgressiveShortcutTipParts";
import { visibleShortcutHintActions } from "@web/shortcuts/tips/visible-shortcut-hint.store";

/**
 * Sidebar status bar line when a date picker owns keyboard-help context.
 * Reuses celebration wiring via `visibleShortcutHintActions` like `ShortcutTipIndicator`.
 */
export const DatePickerContextualHint: FC = () => {
  const surface = useDatePickerHintStore((s) => s.stack.at(-1) ?? null);
  const syntheticId = surface ? `date-picker-context-${surface.id}` : "";

  useEffect(() => {
    if (!surface) {
      visibleShortcutHintActions.clearSidebarHint();
      return;
    }
    const allParts = [...surface.parts, ...(surface.secondaryParts ?? [])];
    visibleShortcutHintActions.setSidebarHint({
      id: syntheticId,
      parts: allParts,
    });
    return () => visibleShortcutHintActions.clearSidebarHint();
  }, [surface, syntheticId]);

  if (!surface) return null;

  return (
    <div className="flex w-full min-w-0 flex-col items-center px-1">
      <span
        aria-live="polite"
        className="block w-full max-w-md text-pretty break-words text-center text-text-muted text-xs leading-5"
        role="status"
        data-testid="date-picker-contextual-hint"
      >
        <ProgressiveShortcutTipParts
          hintId={syntheticId}
          primary={surface.parts}
          secondary={surface.secondaryParts}
        />
      </span>
    </div>
  );
};
