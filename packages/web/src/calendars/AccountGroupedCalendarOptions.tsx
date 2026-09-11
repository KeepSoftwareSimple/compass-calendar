import { type Calendar } from "@core/types/calendar.contracts";
import { type SyncConnectionSummary } from "@core/types/user.types";
import {
  accountKey,
  accountLabel,
  groupCalendarsByAccount,
} from "@web/calendars/calendar.util";

interface AccountGroupedCalendarOptionsProps {
  calendars: Calendar[];
  connections: SyncConnectionSummary[];
  optionLabel: (calendar: Calendar) => string;
}

export function AccountGroupedCalendarOptions({
  calendars,
  connections,
  optionLabel,
}: AccountGroupedCalendarOptionsProps) {
  const { groups, ungrouped } = groupCalendarsByAccount(calendars, connections);
  return (
    <>
      {groups
        .filter((group) => group.calendars.length > 0)
        .map((group) => (
          <optgroup key={accountKey(group)} label={accountLabel(group)}>
            {group.calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {optionLabel(calendar)}
              </option>
            ))}
          </optgroup>
        ))}
      {ungrouped.map((calendar) => (
        <option key={calendar.id} value={calendar.id}>
          {optionLabel(calendar)}
        </option>
      ))}
    </>
  );
}
