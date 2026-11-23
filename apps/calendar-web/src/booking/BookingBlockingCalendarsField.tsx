import { useMemo, useState } from "react";
import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";
import { type SyncConnectionSummary } from "@core/types/user.types";
import {
  BookingBlockingAccountGroup,
  blockingAccountGroupKey,
} from "@web/booking/BookingBlockingAccountGroup";
import { BookingCheckboxRow } from "@web/booking/BookingCheckboxRow";
import { BOOKING_BLOCKING_CALENDARS_COLLAPSE_THRESHOLD } from "@web/booking/booking-blocking-calendars.constants";
import { bookingFieldAttrs } from "@web/booking/booking-sequence.fields";
import {
  type AccountGroup,
  accountKey,
  groupCalendarsByAccount,
} from "@web/calendars/calendar.util";

interface BookingBlockingCalendarsFieldProps {
  availabilityCalendars: Calendar[];
  blockingCalendarIds: readonly CalendarId[];
  unavailableCalendars: readonly Pick<Calendar, "id" | "name">[];
  connections: SyncConnectionSummary[];
  onToggle: (calendarId: CalendarId, checked: boolean) => void;
}

function initialCollapsedKeys(
  groups: AccountGroup[],
  defaultCollapsed: boolean,
): Set<string> {
  if (!defaultCollapsed) return new Set();
  return new Set(groups.map((group) => accountKey(group)));
}

export function BookingBlockingCalendarsField({
  availabilityCalendars,
  blockingCalendarIds,
  unavailableCalendars,
  connections,
  onToggle,
}: BookingBlockingCalendarsFieldProps) {
  const blockingSet = useMemo(
    () => new Set(blockingCalendarIds),
    [blockingCalendarIds],
  );
  const { groups, ungrouped } = groupCalendarsByAccount(
    availabilityCalendars,
    connections,
  );
  const groupsWithCalendars = groups.filter(
    (group) => group.calendars.length > 0,
  );
  const calendarCount = availabilityCalendars.length;
  const useCollapsibleGroups =
    groupsWithCalendars.length > 1 ||
    calendarCount > BOOKING_BLOCKING_CALENDARS_COLLAPSE_THRESHOLD;
  const defaultCollapsed =
    calendarCount > BOOKING_BLOCKING_CALENDARS_COLLAPSE_THRESHOLD;

  const [collapsedKeys, setCollapsedKeys] = useState(() =>
    useCollapsibleGroups
      ? initialCollapsedKeys(groupsWithCalendars, defaultCollapsed)
      : new Set<string>(),
  );

  const toggleGroup = (key: string) => {
    setCollapsedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const renderBlockingCalendar = (calendar: Calendar) => (
    <BookingCheckboxRow
      checked={blockingSet.has(calendar.id)}
      key={calendar.id}
      onChange={(checked) => onToggle(calendar.id, checked)}
    >
      {calendar.name}
    </BookingCheckboxRow>
  );

  return (
    <fieldset
      className="flex flex-col gap-2"
      {...bookingFieldAttrs("blocking")}
    >
      <legend className="mb-1 text-sm text-text">Blocking calendars</legend>
      {unavailableCalendars.length > 0 && (
        <div>
          <p className="text-sm text-text-muted">
            Compass can no longer check these calendars. Reconnect them, or
            uncheck them and save to allow bookings without checking their
            events.
          </p>
          {unavailableCalendars.map((calendar) => (
            <BookingCheckboxRow
              key={calendar.id}
              checked={blockingSet.has(calendar.id)}
              onChange={(checked) => onToggle(calendar.id, checked)}
            >
              {calendar.name}
            </BookingCheckboxRow>
          ))}
        </div>
      )}
      {availabilityCalendars.length === 0 ? (
        <p className="text-sm text-text-muted">No calendars available.</p>
      ) : useCollapsibleGroups ? (
        <>
          {groupsWithCalendars.map((group) => {
            const key = blockingAccountGroupKey(group);
            return (
              <BookingBlockingAccountGroup
                blockingCalendarIds={blockingSet}
                expanded={!collapsedKeys.has(key)}
                group={group}
                key={key}
                onToggleCalendar={onToggle}
                onToggleExpanded={() => toggleGroup(key)}
              />
            );
          })}
          {ungrouped.map(renderBlockingCalendar)}
        </>
      ) : (
        <>
          {groupsWithCalendars.map((group) => (
            <div
              className="flex min-w-0 flex-col gap-2"
              key={blockingAccountGroupKey(group)}
            >
              {group.calendars.map(renderBlockingCalendar)}
            </div>
          ))}
          {ungrouped.map(renderBlockingCalendar)}
        </>
      )}
    </fieldset>
  );
}
