import { timezoneMismatchCopy } from "@web/timezone/timezone-mismatch";

export function TimezoneMismatchBanner({
  browserZone,
  calendarZone,
  onKeep,
  onSwitch,
}: {
  browserZone: string;
  calendarZone: string;
  onKeep: () => void;
  onSwitch: () => void;
}) {
  const { keepLabel, message, switchLabel } = timezoneMismatchCopy(
    browserZone,
    calendarZone,
  );

  return (
    <section
      aria-label="Timezone mismatch"
      data-notice=""
      className="flex flex-wrap items-center justify-between gap-3 border-border border-b bg-surface-panel px-4 py-2 text-text-muted text-xs"
    >
      <p>{message}</p>
      <div className="flex shrink-0 gap-2">
        <button
          className="c-focus-ring rounded-xs px-2 py-1 font-medium text-text hover:bg-surface-overlay"
          onClick={onSwitch}
          type="button"
        >
          {switchLabel}
        </button>
        <button
          className="c-focus-ring rounded-xs px-2 py-1 text-text hover:bg-surface-overlay"
          onClick={onKeep}
          type="button"
        >
          {keepLabel}
        </button>
      </div>
    </section>
  );
}
