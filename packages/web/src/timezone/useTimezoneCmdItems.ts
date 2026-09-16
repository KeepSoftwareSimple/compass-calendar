import { GlobeIcon } from "@phosphor-icons/react";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";
import { withPaletteShortcut } from "@web/components/CommandPalette/palette-shortcut-telemetry";
import { settingsActions } from "@web/settings/settings.store";
import { APP_SHORTCUT_BINDINGS } from "@web/shortcuts/app-shortcut-bindings";
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
      shortcut: [...APP_SHORTCUT_BINDINGS.otherTimeTravel.keycaps],
      keywords: ["timezone", "time zone", "tz", "secondary"],
      onClick: withPaletteShortcut("other-time-travel", () => {
        settingsActions.markOverlayOpenedFromPalette();
        timezoneDialogActions.open("time-travel");
      }),
    },
  ];
}
