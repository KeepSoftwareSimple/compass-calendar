import { type RefObject, useMemo, useRef } from "react";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";
import { getBrowserTimeZone } from "@web/timezone/browser-timezone";
import { dismissSecondaryTimeZone } from "@web/timezone/dismiss-secondary-timezone";
import {
  setPinnedTimeZone,
  useEffectiveTimeZone,
  usePinnedTimeZone,
} from "@web/timezone/effective-timezone.store";
import { formatTimeZoneAbbreviation } from "@web/timezone/format-timezone-abbreviation";
import {
  TimezoneCombobox,
  type TimezoneComboboxHeadOption,
} from "@web/timezone/TimezoneCombobox";
import {
  setTimeTravelZone,
  useTimeTravelZone,
} from "@web/timezone/time-travel.store";
import { type TimezoneDialogPurpose } from "@web/timezone/timezone-dialog.store";

const AUTO_ID = "auto";
const STOP_ID = "hide-second-timezone";

interface TimezonePickerDialogProps {
  onDismiss: () => void;
  purpose?: TimezoneDialogPurpose;
  skipFocusRestoreRef?: RefObject<boolean>;
}

export function TimezonePickerDialog({
  onDismiss,
  purpose = "pin",
  skipFocusRestoreRef,
}: TimezonePickerDialogProps) {
  const isTimeTravel = purpose === "time-travel";
  const effectiveTimeZone = useEffectiveTimeZone();
  const pinnedTimeZone = usePinnedTimeZone();
  const timeTravelZone = useTimeTravelZone();
  const searchRef = useRef<HTMLInputElement>(null);

  const browserZone = getBrowserTimeZone();
  const browserAbbreviation = formatTimeZoneAbbreviation(browserZone);
  const isAuto = pinnedTimeZone === null;

  const headOptions = useMemo<TimezoneComboboxHeadOption[]>(() => {
    if (isTimeTravel) {
      // Only offered while a second zone is showing, and it goes away as soon as
      // the user starts searching for another zone.
      return timeTravelZone === null
        ? []
        : [
            {
              id: STOP_ID,
              label: "Hide second timezone",
              description: "Remove the extra hour column",
              selected: false,
              value: null,
              hideOnQuery: true,
            },
          ];
    }
    return [
      {
        id: AUTO_ID,
        label: "Use browser timezone (Auto)",
        description: `Currently ${browserAbbreviation}`,
        selected: isAuto,
        value: null,
      },
    ];
  }, [browserAbbreviation, isAuto, isTimeTravel, timeTravelZone]);

  const value = isTimeTravel
    ? timeTravelZone
    : isAuto
      ? null
      : effectiveTimeZone;

  const commit = (timeZone: string | null) => {
    if (isTimeTravel) {
      if (timeZone === null) {
        dismissSecondaryTimeZone();
      } else {
        setTimeTravelZone(timeZone);
      }
    } else {
      setPinnedTimeZone(timeZone);
    }
    onDismiss();
  };

  return (
    <OverlayPanel
      title={isTimeTravel ? "Second timezone" : "Change default timezone"}
      message={
        isTimeTravel
          ? "Compare your calendar hours in a second timezone."
          : undefined
      }
      onDismiss={onDismiss}
      skipFocusRestoreRef={skipFocusRestoreRef}
      initialFocusRef={searchRef}
      align="start"
      variant="modal"
      widthClassName="w-[480px]"
    >
      <TimezoneCombobox
        excludeZone={isTimeTravel ? effectiveTimeZone : undefined}
        headOptions={headOptions}
        inputRef={searchRef}
        onSelect={commit}
        searchLabel="Search timezones"
        sortAround={effectiveTimeZone}
        value={value}
      />
    </OverlayPanel>
  );
}
