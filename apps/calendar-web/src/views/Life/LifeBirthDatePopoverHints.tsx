import { MONTH_PICKER_PREV_KEYCAPS } from "@core/shortcuts/binding-keycaps.constants";
import { EventFormHintKeys } from "@web/views/Forms/EventForm/EventFormFocusedHint";

export type LifeBirthDateHintMode = "closed" | "day" | "year" | "month";

export function LifeBirthDatePopoverHints({
  mode,
}: {
  mode: LifeBirthDateHintMode;
}) {
  if (mode === "closed") {
    return (
      <EventFormHintKeys
        keys="ArrowDown"
        label="Arrow down opens the calendar"
      />
    );
  }

  if (mode === "year" || mode === "month") {
    return (
      <span
        data-testid="life-birth-date-calendar-hint"
        className="flex pointer-coarse:hidden max-w-full flex-wrap items-center justify-end gap-x-1 gap-y-0.5"
      >
        <EventFormHintKeys keys="Enter" label="Enter selects" />
        <span aria-hidden className="text-text-muted">
          ·
        </span>
        <EventFormHintKeys keys="Esc" label="Escape closes" />
      </span>
    );
  }

  return (
    <span
      data-testid="life-birth-date-calendar-hint"
      className="flex pointer-coarse:hidden max-w-full flex-wrap items-center justify-end gap-x-1 gap-y-0.5"
    >
      <EventFormHintKeys
        keys={["ArrowUp", "ArrowDown", "ArrowLeft"]}
        label="Arrow keys move in the calendar"
      />
      <span aria-hidden className="text-text-muted">
        ·
      </span>
      <EventFormHintKeys keys="Enter" label="Enter selects the day" />
      <span aria-hidden className="text-text-muted">
        ·
      </span>
      <EventFormHintKeys
        keys={["PageUp", "PageDown"]}
        label="Page up and page down change month"
      />
      <span aria-hidden className="text-text-muted">
        ·
      </span>
      <EventFormHintKeys
        keys={["Shift", "PageUp"]}
        label="Shift page up changes year"
      />
      <span aria-hidden className="text-text-muted">
        ·
      </span>
      <EventFormHintKeys
        keys={[...MONTH_PICKER_PREV_KEYCAPS]}
        label="Previous month"
      />
    </span>
  );
}
