import { type FC } from "react";
import { APP_SHORTCUT_BINDINGS } from "@core/shortcuts/app-shortcut-bindings";
import { type GridScheduleDraft } from "@web/events/event-draft.types";
import { ShortcutTipParts } from "@web/shortcuts/tips/ShortcutTipParts";
import { inEffectiveTimeZone } from "@web/timezone/in-time-zone";

export const EventPastePreviewIndicator: FC<{
  schedule: GridScheduleDraft | undefined;
}> = ({ schedule }) => {
  const start = schedule ? inEffectiveTimeZone(schedule.start) : null;
  const destination = start?.format(
    schedule?.kind === "allDay" ? "ddd, MMM D" : "ddd, MMM D [at] h:mm A",
  );

  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className={
        schedule
          ? "min-w-0 flex-1 text-pretty text-center text-text-muted text-xs leading-5"
          : "sr-only"
      }
    >
      {schedule && (
        <>
          <div className="font-medium text-text">Event copied to clipboard</div>
          <div>
            Paste to {destination}
            {schedule.kind === "allDay" ? " (all day)" : ""}
          </div>
          <ShortcutTipParts
            parts={[
              { keys: [...APP_SHORTCUT_BINDINGS.editPaste.keycaps] },
              " paste · ",
              schedule.kind === "allDay"
                ? "Left/Right adjust · "
                : "Arrows adjust · ",
              { key: "Esc" },
              " cancel",
            ]}
          />
        </>
      )}
    </div>
  );
};
