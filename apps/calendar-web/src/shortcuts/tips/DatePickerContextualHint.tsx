import classNames from "classnames";
import { type FC, useEffect, useMemo } from "react";
import { useDatePickerHintStore } from "@web/shortcuts/tips/date-picker-hint.store";
import { ShortcutTipParts } from "@web/shortcuts/tips/ShortcutTipParts";
import { visibleShortcutHintActions } from "@web/shortcuts/tips/visible-shortcut-hint.store";

/**
 * Sidebar status bar line when a date picker owns keyboard-help context.
 * Reuses celebration wiring via `visibleShortcutHintActions` like `ShortcutTipIndicator`.
 */
export const DatePickerContextualHint: FC = () => {
  const surface = useDatePickerHintStore((s) => s.stack.at(-1) ?? null);
  const syntheticId = useMemo(
    () => (surface ? `date-picker-context-${surface.id}` : ""),
    [surface],
  );

  useEffect(() => {
    if (!surface) {
      visibleShortcutHintActions.clearSidebarHint();
      return;
    }
    visibleShortcutHintActions.setSidebarHint({
      id: syntheticId,
      parts: surface.parts,
    });
    return () => visibleShortcutHintActions.clearSidebarHint();
  }, [surface, syntheticId]);

  if (!surface) return null;

  return (
    <div className="flex w-full min-w-0 flex-col items-center px-1">
      <span
        aria-live="polite"
        className={classNames(
          "block w-full max-w-md text-pretty break-words text-center text-text-muted text-xs leading-5",
        )}
        role="status"
        data-testid="date-picker-contextual-hint"
        data-date-picker-hint-id={surface.id}
      >
        <ShortcutTipParts hintId={syntheticId} parts={surface.parts} />
      </span>
    </div>
  );
};
