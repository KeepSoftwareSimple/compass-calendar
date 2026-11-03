import { GlobeIcon } from "@phosphor-icons/react/dist/csr/Globe";
import { APP_SHORTCUT_BINDINGS } from "@core/shortcuts/app-shortcut-bindings";
import { type CommandItem } from "@web/components/CommandPalette/command-palette.types";
import { withPaletteShortcut } from "@web/components/CommandPalette/palette-shortcut-telemetry";
import { settingsActions } from "@web/settings/settings.store";
import {
  TIMEZONE_MISMATCH_KEEP_SHORTCUT_KEY,
  TIMEZONE_MISMATCH_SWITCH_SHORTCUT_KEY,
} from "@web/shortcuts/notice-focus/useNoticeActionShortcut";
import {
  setPinnedTimeZone,
  useBrowserTimeZone,
  useEffectiveTimeZone,
  usePinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { formatTimeZoneAbbreviation } from "@web/timezone/format-timezone-abbreviation";
import { timezoneDialogActions } from "@web/timezone/timezone-dialog.store";
import {
  shouldShowTimezoneMismatch,
  snoozeTimezoneMismatch,
  timezoneMismatchCopy,
  useTimezoneMismatchSnoozedBrowser,
} from "@web/timezone/timezone-mismatch";

export function useTimezoneCmdItems(): CommandItem[] {
  const timeZone = useEffectiveTimeZone();
  const abbreviation = formatTimeZoneAbbreviation(timeZone);
  const pinnedTimeZone = usePinnedTimeZone();
  const browserTimeZone = useBrowserTimeZone();
  const snoozedForBrowser = useTimezoneMismatchSnoozedBrowser();
  const mismatchActive = shouldShowTimezoneMismatch(
    pinnedTimeZone,
    browserTimeZone,
    snoozedForBrowser,
  );

  const mismatchItems: CommandItem[] = mismatchActive
    ? (() => {
        const copy = timezoneMismatchCopy(browserTimeZone, pinnedTimeZone!);
        return [
          {
            id: "timezone-mismatch-switch",
            label: copy.switchLabel,
            icon: GlobeIcon,
            shortcut: [TIMEZONE_MISMATCH_SWITCH_SHORTCUT_KEY],
            keywords: ["timezone", "device", "switch"],
            onClick: () => setPinnedTimeZone(browserTimeZone),
          },
          {
            id: "timezone-mismatch-keep",
            label: copy.keepLabel,
            icon: GlobeIcon,
            shortcut: [TIMEZONE_MISMATCH_KEEP_SHORTCUT_KEY],
            keywords: ["timezone", "keep", "calendar"],
            onClick: () => snoozeTimezoneMismatch(browserTimeZone),
          },
        ];
      })()
    : [];

  return [
    ...mismatchItems,
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
      label: "Show second timezone",
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
