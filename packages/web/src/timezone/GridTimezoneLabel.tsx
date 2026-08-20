import { XIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { useMinuteTick } from "@web/common/hooks/useMinuteTick";
import { GRID_TIME_COLUMN_WIDTH } from "@web/grid/grid.constants";
import {
  refreshEffectiveTimeZoneFromBrowser,
  useEffectiveTimeZone,
} from "@web/timezone/effective-timezone.store";
import { formatTimeZoneAbbreviation } from "@web/timezone/format-timezone-abbreviation";
import {
  setTimeTravelZone,
  useTimeTravelZone,
} from "@web/timezone/time-travel.store";
import { timezoneDialogActions } from "@web/timezone/timezone-dialog.store";

const BROWSER_ZONE_POLL_MS = 60_000;

/**
 * Week/Day grid-corner control showing the effective timezone abbreviation.
 * Click opens time travel (the same picker, committing a secondary zone).
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
  const openTimeTravel = () =>
    timezoneDialogActions.open(undefined, "time-travel");

  if (timeTravelZone === null) {
    return (
      <button
        aria-label={`Calendar timezone: ${abbreviation}`}
        className="c-focus-ring min-h-6 w-full max-w-full truncate rounded-sm px-0.5 text-center text-[10px] text-text-muted leading-none hover:text-text"
        onClick={openTimeTravel}
        type="button"
      >
        {abbreviation}
      </button>
    );
  }

  const travelAbbreviation = formatTimeZoneAbbreviation(
    timeTravelZone,
    now.toDate(),
  );

  return (
    <fieldset
      className="m-0 flex w-full min-w-0 items-end border-0 p-0"
      aria-label="Time travel timezones"
    >
      <div
        className="flex items-center justify-center gap-0.5"
        style={{ width: GRID_TIME_COLUMN_WIDTH }}
      >
        <button
          aria-label={`Time travel timezone: ${travelAbbreviation}`}
          className="c-focus-ring min-h-6 min-w-0 truncate rounded-sm px-0.5 text-center text-[10px] text-text-muted leading-none hover:text-text"
          onClick={openTimeTravel}
          type="button"
        >
          {travelAbbreviation}
        </button>
        <button
          aria-label="Remove time travel timezone"
          className="c-focus-ring flex size-4 shrink-0 items-center justify-center rounded-sm text-text-muted hover:text-text"
          onClick={() => setTimeTravelZone(null)}
          type="button"
        >
          <XIcon aria-hidden="true" className="size-3" />
        </button>
      </div>
      <button
        aria-label={`Calendar timezone: ${abbreviation}`}
        className="c-focus-ring min-h-6 truncate rounded-sm px-0.5 text-center text-[10px] text-text-muted leading-none hover:text-text"
        onClick={openTimeTravel}
        style={{ width: GRID_TIME_COLUMN_WIDTH }}
        type="button"
      >
        {abbreviation}
      </button>
    </fieldset>
  );
};
