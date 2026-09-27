import { settingsActions } from "@web/settings/settings.store";
import {
  useEffectiveTimeZone,
  usePinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { formatTimeZoneAbbreviation } from "@web/timezone/format-timezone-abbreviation";
import { timeZoneCityName } from "@web/timezone/timezone-catalog";
import { timezoneDialogActions } from "@web/timezone/timezone-dialog.store";

export function DefaultTimezonePicker() {
  const timeZone = useEffectiveTimeZone();
  const pinnedTimeZone = usePinnedTimeZone();
  const abbreviation = formatTimeZoneAbbreviation(timeZone);
  const label =
    pinnedTimeZone === null
      ? `Auto (${abbreviation})`
      : `${timeZoneCityName(timeZone)} (${abbreviation})`;

  return (
    <div>
      <p className="mb-1 text-sm text-text">Default timezone</p>
      <button
        aria-label={`Default timezone: ${label}`}
        className="c-focus-ring w-full rounded border border-border bg-surface-overlay px-2 py-1 text-left text-sm text-text hover:bg-surface-panel"
        onClick={() => {
          settingsActions.closeSettings();
          timezoneDialogActions.open();
        }}
        type="button"
      >
        {label}
      </button>
    </div>
  );
}
