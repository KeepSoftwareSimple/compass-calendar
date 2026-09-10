import { type KeyboardEvent } from "react";
import { type BookingDurationMinutes } from "@core/types/booking.contracts";
import { BOOKING_DURATION_OPTIONS } from "@web/booking/booking.util";

const pillClassName =
  "c-focus-ring min-h-10 min-w-14 rounded border border-border px-3 text-sm text-text hover:bg-surface-panel aria-checked:border-accent aria-checked:bg-accent aria-checked:text-on-accent";

interface BookingSetupDurationStepProps {
  onChange: (durationMinutes: BookingDurationMinutes) => void;
  value: BookingDurationMinutes;
}

export function BookingSetupDurationStep({
  onChange,
  value,
}: BookingSetupDurationStepProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = BOOKING_DURATION_OPTIONS.indexOf(value);
    if (index < 0) return;

    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = Math.min(index + 1, BOOKING_DURATION_OPTIONS.length - 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = Math.max(index - 1, 0);
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = BOOKING_DURATION_OPTIONS.length - 1;
        break;
      case " ":
        event.preventDefault();
        onChange(value);
        return;
      default:
        return;
    }

    const next = BOOKING_DURATION_OPTIONS[nextIndex ?? index];
    if (next == null || next === value) return;
    event.preventDefault();
    onChange(next);
    const radios =
      event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]');
    radios[nextIndex ?? index]?.focus();
  };

  return (
    <div
      aria-label="Meeting duration"
      className="flex flex-wrap gap-2"
      onKeyDown={handleKeyDown}
      role="radiogroup"
    >
      {BOOKING_DURATION_OPTIONS.map((minutes) => (
        // biome-ignore lint/a11y/useSemanticElements: pill buttons use roving tabindex like weekly day pills
        <button
          aria-checked={value === minutes}
          className={pillClassName}
          key={minutes}
          onClick={() => onChange(minutes)}
          role="radio"
          tabIndex={minutes === value ? 0 : -1}
          type="button"
        >
          {minutes} min
        </button>
      ))}
    </div>
  );
}
