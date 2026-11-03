import { formatDurationMinutesCompact } from "@booking-web/booking/public-booking.format";
import { useHotkey } from "@tanstack/react-hotkeys";
import {
  type BookingMeetingType,
  type BookingMeetingTypes,
} from "@core/types/booking.contracts";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";

interface PublicBookingMeetingTypePickerProps {
  types: BookingMeetingTypes;
  selectedId: string;
  /** Digit keys only fire while the guest is picking a time. */
  shortcutsEnabled: boolean;
  onSelect: (id: string) => void;
}

/**
 * Lets the guest pick which meeting to book. Hidden on one-type pages, so
 * those look exactly as they did before meeting types existed.
 */
export function PublicBookingMeetingTypePicker({
  types,
  selectedId,
  shortcutsEnabled,
  onSelect,
}: PublicBookingMeetingTypePickerProps) {
  const multiple = types.length > 1;
  const typeAt = (index: number): BookingMeetingType | undefined =>
    types[index];

  // Fixed calls keep hook order stable; the cap is three types.
  useMeetingTypeDigit("1", typeAt(0), multiple && shortcutsEnabled, onSelect);
  useMeetingTypeDigit("2", typeAt(1), multiple && shortcutsEnabled, onSelect);
  useMeetingTypeDigit("3", typeAt(2), multiple && shortcutsEnabled, onSelect);

  if (!multiple) return null;

  return (
    <section aria-labelledby="booking-meeting-type-heading">
      <h2
        id="booking-meeting-type-heading"
        className="font-medium text-base text-text"
      >
        Pick a meeting
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {types.map((type, index) => {
          const selected = type.id === selectedId;
          return (
            <li key={type.id}>
              <button
                type="button"
                aria-pressed={selected}
                data-meeting-type={type.id}
                onClick={() => onSelect(type.id)}
                className="c-focus-ring flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-left text-sm text-text transition-colors hover:border-accent hover:bg-surface-panel aria-pressed:border-accent aria-pressed:bg-surface-panel"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{type.label}</span>
                  <span className="text-text-muted">
                    {formatDurationMinutesCompact(type.durationMinutes)}
                  </span>
                </span>
                <ShortcutKeys keys={String(index + 1)} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function useMeetingTypeDigit(
  key: "1" | "2" | "3",
  type: BookingMeetingType | undefined,
  enabled: boolean,
  onSelect: (id: string) => void,
) {
  useHotkey(
    key,
    (event) => {
      if (!type) return;
      event.preventDefault();
      onSelect(type.id);
    },
    { enabled: enabled && Boolean(type), ignoreInputs: true },
  );
}
