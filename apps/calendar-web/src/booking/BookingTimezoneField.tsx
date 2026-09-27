import { useRef, useState } from "react";
import { type TimeZone } from "@core/types/domain-primitives";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";
import { formatTimeZoneAbbreviation } from "@web/timezone/format-timezone-abbreviation";
import { TimezoneCombobox } from "@web/timezone/TimezoneCombobox";
import { timeZoneCityName } from "@web/timezone/timezone-catalog";

interface BookingTimezoneFieldProps {
  timeZone: TimeZone;
  onChange: (timeZone: TimeZone) => void;
  disabled?: boolean;
}

/**
 * The meeting page's timezone, picked through the same searchable combobox as
 * time travel and the default-timezone dialog. It was a native <select> over
 * the whole IANA catalog: ~420 options in raw id order, where the browser's
 * type-ahead matches the rendered city text, so typing "America" or "US" found
 * nothing. Now it is one tab stop, and the trigger renders whatever zone is
 * stored - including a non-canonical alias, which had no <option> at all.
 */
export function formatBookingTimezoneLabel(timeZone: TimeZone): string {
  return `${timeZoneCityName(timeZone)} (${formatTimeZoneAbbreviation(timeZone)})`;
}

export function BookingTimezoneField({
  timeZone,
  onChange,
  disabled = false,
}: BookingTimezoneFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const label = formatBookingTimezoneLabel(timeZone);

  return (
    <div>
      <p className="mb-1 text-sm text-text" id="booking-timezone-label">
        Meeting timezone
      </p>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`Meeting timezone: ${label}`}
        className="c-focus-ring w-full min-w-0 rounded border border-border bg-surface-overlay px-2 py-1 text-left text-sm text-text hover:bg-surface-panel disabled:pointer-events-none disabled:opacity-60"
        disabled={disabled}
        id="booking-timezone"
        onClick={() => setIsOpen(true)}
        ref={triggerRef}
        title={label}
        type="button"
      >
        <span className="block truncate">{label}</span>
      </button>

      {isOpen ? (
        <OverlayPanel
          align="start"
          initialFocusRef={searchRef}
          onDismiss={() => setIsOpen(false)}
          restoreFocus={() => triggerRef.current?.focus()}
          title="Meeting timezone"
          variant="modal"
          widthClassName="w-[480px]"
        >
          <TimezoneCombobox
            inputRef={searchRef}
            onSelect={(nextTimeZone) => {
              if (nextTimeZone) onChange(nextTimeZone as TimeZone);
              setIsOpen(false);
            }}
            searchLabel="Search meeting timezones"
            value={timeZone}
          />
        </OverlayPanel>
      ) : null}
    </div>
  );
}
