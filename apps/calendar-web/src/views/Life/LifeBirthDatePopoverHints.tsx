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
    <span className="inline-flex items-baseline gap-1 text-text-muted text-xs">
      <ShortcutKeys keys={keys} className="translate-y-px" />
      <span aria-hidden className="leading-none">
        {label}
      </span>
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
        className="flex pointer-coarse:hidden max-w-full flex-wrap items-baseline gap-x-2 gap-y-0.5"
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
        className="flex pointer-coarse:hidden max-w-full flex-wrap items-baseline gap-x-2 gap-y-0.5"
      >
        <HintRow keys="Enter" label="save typed date" />
        <HintRow keys="ArrowDown" label="move to calendar" />
        <HintRow keys="Esc" label="dismiss" />
      </span>
    );
  }

  return (
    <span
      data-testid="life-birth-date-calendar-hint"
      className="flex pointer-coarse:hidden max-w-full flex-col gap-0.5 text-text-muted text-xs"
    >
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <HintRow keys={["ArrowUp", "ArrowDown"]} label="week" />
        <HintRow keys={["ArrowLeft", "ArrowRight"]} label="day" />
        <HintRow keys={["PageUp", "PageDown"]} label="month" />
        <HintRow keys={["Shift", "PageUp"]} label="year back" />
        <HintRow keys={["Shift", "PageDown"]} label="year forward" />
      </span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <HintRow keys="Enter" label="select day" />
        <HintRow keys="Esc" label="close" />
      </span>
    </span>
  );
}
