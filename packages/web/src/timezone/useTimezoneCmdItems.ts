import { GlobeIcon } from "@phosphor-icons/react";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";
import { restoreCommandPaletteFocus } from "@web/components/Feedback/FeedbackDialogHost";
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
      onClick: () => timezoneDialogActions.open(restoreCommandPaletteFocus),
    },
    {
      id: "time-travel",
      label: "Time travel",
      icon: GlobeIcon,
      shortcut: ["Z"],
      keywords: ["timezone", "time zone", "tz", "secondary"],
      onClick: () =>
        timezoneDialogActions.open(restoreCommandPaletteFocus, "time-travel"),
    },
  ];
}
