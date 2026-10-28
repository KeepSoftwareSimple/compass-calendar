import classNames from "classnames";
import { type ReactNode } from "react";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";

/** Keycaps overlaid inside a schedule control (never below it). */
export function EventFormInfieldHint({
  children,
  className,
  testId = "event-form-control-hint",
  visible = true,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
  visible?: boolean;
}) {
  if (!visible) return null;

  return (
    <span
      data-testid={testId}
      className={classNames(
        "pointer-events-none absolute top-1/2 right-1.5 z-10 -translate-y-1/2",
        "invisible opacity-0 transition-opacity group-focus-within/control:visible group-focus-within/control:opacity-100",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EventFormHintKeys({
  keys,
  label,
}: {
  keys: string | string[];
  label: string;
}) {
  return (
    <>
      <span className="sr-only">{label}</span>
      <ShortcutKeys keys={keys} />
    </>
  );
}

/** Compact keycap row for the event-form date popover header. */
export function EventFormCalendarPopoverHints() {
  return (
    <span
      data-testid="event-form-calendar-hint"
      className="flex pointer-coarse:hidden items-center gap-1"
    >
      <EventFormHintKeys
        keys={["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]}
        label="Arrow keys move in the calendar"
      />
      <span aria-hidden className="text-text-muted">
        ·
      </span>
      <EventFormHintKeys keys="Enter" label="Enter selects the day" />
      <span aria-hidden className="text-text-muted">
        ·
      </span>
      <EventFormHintKeys keys="Esc" label="Escape closes the calendar" />
    </span>
  );
}
