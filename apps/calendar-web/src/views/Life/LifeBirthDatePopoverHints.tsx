import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { EventFormHintKeys } from "@web/views/Forms/EventForm/EventFormFocusedHint";

export type LifeBirthDateHintMode =
  | "closed"
  | "typing"
  | "grid"
  | "year"
  | "month";

function HintRow({ keys, label }: { keys: string | string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-text-muted text-xs">
      <ShortcutKeys keys={keys} />
      <span aria-hidden>{label}</span>
    </span>
  );
}

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
        className="flex pointer-coarse:hidden max-w-full flex-wrap items-center justify-end gap-x-2 gap-y-0.5"
      >
        <HintRow keys="Enter" label="select" />
        <HintRow keys="Esc" label="close" />
      </span>
    );
  }

  if (mode === "typing") {
    return (
      <span
        data-testid="life-birth-date-calendar-hint"
        className="flex pointer-coarse:hidden max-w-full flex-wrap items-center justify-end gap-x-2 gap-y-0.5"
      >
        <HintRow keys="Enter" label="save" />
        <HintRow keys="ArrowDown" label="calendar" />
      </span>
    );
  }

  return (
    <span
      data-testid="life-birth-date-calendar-hint"
      className="flex pointer-coarse:hidden max-w-full flex-wrap items-center justify-end gap-x-2 gap-y-0.5"
    >
      <HintRow keys={["ArrowUp", "ArrowDown", "ArrowLeft"]} label="day" />
      <HintRow keys={["PageUp", "PageDown"]} label="month" />
      <HintRow keys={["Shift", "PageUp"]} label="year" />
    </span>
  );
}
