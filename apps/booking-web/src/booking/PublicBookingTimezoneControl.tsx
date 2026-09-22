import { useRef, useState } from "react";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";
import { formatTimeZoneAbbreviation } from "@web/timezone/format-timezone-abbreviation";
import { TimezoneCombobox } from "@web/timezone/TimezoneCombobox";
import { timeZoneCityName } from "@web/timezone/timezone-catalog";

interface PublicBookingTimezoneControlProps {
  timeZone: string;
  onChange: (timeZone: string) => void;
}

export function PublicBookingTimezoneControl({
  timeZone,
  onChange,
}: PublicBookingTimezoneControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const label = `${timeZoneCityName(timeZone)} (${formatTimeZoneAbbreviation(timeZone)})`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`Timezone: ${label}`}
        className="c-focus-ring rounded-md text-left text-sm text-text underline"
        onClick={() => setIsOpen(true)}
      >
        {label}
      </button>
      {isOpen ? (
        <OverlayPanel
          align="start"
          initialFocusRef={searchRef}
          onDismiss={() => setIsOpen(false)}
          restoreFocus={() => triggerRef.current?.focus()}
          title="Timezone"
          variant="modal"
          widthClassName="w-120"
        >
          <TimezoneCombobox
            inputRef={searchRef}
            onSelect={(nextTimeZone) => {
              if (nextTimeZone) {
                onChange(nextTimeZone);
              }
              setIsOpen(false);
            }}
            searchLabel="Search timezones"
            value={timeZone}
          />
        </OverlayPanel>
      ) : null}
    </>
  );
}
