import { useEffect } from "react";
import { useMinuteTick } from "@web/common/hooks/useMinuteTick";
import { GRID_TIME_COLUMN_WIDTH } from "@web/grid/grid.constants";
import {
  refreshEffectiveTimeZoneFromBrowser,
  useEffectiveTimeZone,
} from "@web/timezone/effective-timezone.store";
import { formatTimeZoneAbbreviation } from "@web/timezone/format-timezone-abbreviation";
import { useTimeTravelZone } from "@web/timezone/time-travel.store";
import { timezoneDialogActions } from "@web/timezone/timezone-dialog.store";

const BROWSER_ZONE_POLL_MS = 60_000;

const travelingLabelClassName =
  "c-focus-ring min-h-6 truncate rounded-sm px-0.5 text-center text-[10px] text-text-muted leading-none hover:text-text";

/**
 * Week/Day grid-corner control showing the effective timezone abbreviation.
 * A blocked click teaches `z`; Enter/Space still opens time travel.
 */
export const GridTimezoneLabel = () => {
  const timeZone = useEffectiveTimeZone();
  const timeTravelZone = useTimeTravelZone();
  const now = useMinuteTick();

  // There is no timezonechange event. Poll so Auto mode follows an OS change
  // without a tab blur. Do not refresh on mount — that would wipe a test pin
  // before Auto-gating can keep it. DST abbreviation flips still use `now`
  // from the minute tick.
  useEffect(() => {
    const id = setInterval(
      refreshEffectiveTimeZoneFromBrowser,
      BROWSER_ZONE_POLL_MS,
    );
    return () => clearInterval(id);
  }, []);

  const abbreviation = formatTimeZoneAbbreviation(timeZone, now.toDate());
  const openTimeTravel = () => timezoneDialogActions.open("time-travel");
  const isTraveling = timeTravelZone !== null;
  const travelAbbreviation = isTraveling
    ? formatTimeZoneAbbreviation(timeTravelZone, now.toDate())
    : null;

  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: role="group" is set under the same isTraveling condition as the label
    <div
      aria-label={isTraveling ? "Time travel timezones" : undefined}
      className={
        isTraveling ? "flex w-full min-w-0 items-end" : "w-full max-w-full"
      }
      role={isTraveling ? "group" : undefined}
    >
      {isTraveling ? (
        <button
          aria-label={`Time travel timezone: ${travelAbbreviation}`}
          className={travelingLabelClassName}
          onClick={openTimeTravel}
          style={{ width: GRID_TIME_COLUMN_WIDTH }}
          type="button"
        >
          {travelAbbreviation}
        </button>
      ) : null}
      <button
        aria-label={`Calendar timezone: ${abbreviation}`}
        className={
          isTraveling
            ? travelingLabelClassName
            : "c-focus-ring min-h-6 w-full max-w-full truncate rounded-sm px-0.5 text-center text-[10px] text-text-muted leading-none hover:text-text"
        }
        onClick={openTimeTravel}
        style={isTraveling ? { width: GRID_TIME_COLUMN_WIDTH } : undefined}
        type="button"
      >
        {abbreviation}
      </button>
    </div>
  );
};
