import { type FC } from "react";
import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { AccountGroupedCalendarOptions } from "@web/calendars/AccountGroupedCalendarOptions";
import {
  setDefaultCalendarId,
  useDefaultCalendarId,
} from "@web/calendars/default-calendar.store";

interface DefaultCalendarPickerProps {
  calendars: Calendar[];
  connections: SyncConnectionSummary[];
  resolvedDefault: Calendar | undefined;
}

export const DefaultCalendarPicker: FC<DefaultCalendarPickerProps> = ({
  calendars,
  connections,
  resolvedDefault,
}) => {
  const storedId = useDefaultCalendarId();
  const value = storedId ?? resolvedDefault?.id ?? "";

  if (calendars.length === 0) return null;

  return (
    <div>
      <label
        className="mb-1 block text-sm text-text"
        htmlFor="default-calendar"
      >
        Default Calendar
      </label>
      <select
        className="c-focus-ring w-full rounded border border-border bg-surface-overlay px-2 py-1 text-sm text-text hover:bg-surface-panel"
        id="default-calendar"
        onChange={(e) => setDefaultCalendarId(e.target.value as CalendarId)}
        value={value}
      >
        <AccountGroupedCalendarOptions
          calendars={calendars}
          connections={connections}
          optionLabel={(calendar) => calendar.name}
        />
      </select>
    </div>
  );
};
