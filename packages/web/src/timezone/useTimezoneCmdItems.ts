import { GlobeIcon } from "@phosphor-icons/react/dist/csr/Globe";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";
import { settingsActions } from "@web/settings/settings.store";
import { useEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { formatTimeZoneAbbreviation } from "@web/timezone/format-timezone-abbreviation";
import { timezoneDialogActions } from "@web/timezone/timezone-dialog.store";

export function useTimezoneCmdItems(): CommandItem[] {
  const timeZone = useEffectiveTimeZone();
  const abbreviation = formatTimeZoneAbbreviation(timeZone);

  return [
    {
      id: "change-default-timezone",
      label: `Change default timezone (${abbreviation})`,
      icon: GlobeIcon,
      keywords: ["timezone", "time zone", "tz", abbreviation],
      onClick: () => {
        settingsActions.markOverlayOpenedFromPalette();
        timezoneDialogActions.open();
      },
    },
    {
      id: "time-travel",
      label: "Time travel",
      icon: GlobeIcon,
      shortcut: ["Z"],
      keywords: ["timezone", "time zone", "tz", "secondary"],
      onClick: () => {
        settingsActions.markOverlayOpenedFromPalette();
        timezoneDialogActions.open("time-travel");
      },
    },
  ];
}
