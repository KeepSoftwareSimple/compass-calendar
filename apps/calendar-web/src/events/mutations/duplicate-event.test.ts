import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import { type CreateEventInput } from "@core/types/event-command.contracts";
import { commitDuplicateEvent } from "@web/events/mutations/duplicate-event";
import { expect, mock, test } from "bun:test";

const createMock = () => mock((_input: CreateEventInput) => {});

const timedEvent = {
  id: "0123456789abcdef01234567",
  calendarId: "0123456789abcdef76543210",
  content: { kind: "details" as const, title: "Focus", description: "" },
  schedule: {
    kind: "timed" as const,
    start: "2026-07-11T09:00:00-06:00",
    end: "2026-07-11T10:00:00-06:00",
    timeZone: "America/Denver",
  },
  recurrence: { kind: "single" as const },
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: null,
} as unknown as Event;

const seriesEvent = {
  ...(timedEvent as object),
  id: "0123456789abcdef01234598",
  recurrence: {
    kind: "series" as const,
    rules: ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE"],
  },
} as unknown as Event;

const writableCalendar = {
  id: timedEvent.calendarId,
  capabilities: getCalendarCapabilities("owner"),
} as unknown as Calendar;

const readOnlyCalendar = {
  id: timedEvent.calendarId,
  capabilities: getCalendarCapabilities("reader"),
} as unknown as Calendar;

const defaultWritableCalendarId = "0123456789abcdefdddddddd" as CalendarId;
const defaultWritableCalendar = {
  id: defaultWritableCalendarId,
  capabilities: getCalendarCapabilities("owner"),
} as unknown as Calendar;

test("commits with the source event's calendar when it's still writable", () => {
  const create = createMock();

  const committed = commitDuplicateEvent({
    source: timedEvent,
    calendars: [writableCalendar],
    defaultCalendarId: undefined,
    create,
  });

  expect(committed).toBe(true);
  expect(create).toHaveBeenCalledTimes(1);
  const [input] = create.mock.calls[0];
  expect(input.calendarId).toBe(timedEvent.calendarId);
  expect(input.content.title).toBe("Focus");
  expect(input.id).toBeTruthy();
});

test("falls back to the default target calendar when the source calendar is read-only", () => {
  const create = createMock();

  const committed = commitDuplicateEvent({
    source: timedEvent,
    calendars: [readOnlyCalendar, defaultWritableCalendar],
    defaultCalendarId: defaultWritableCalendarId,
    create,
  });

  expect(committed).toBe(true);
  const [input] = create.mock.calls[0];
  expect(input.calendarId).toBe(defaultWritableCalendarId);
});

test("does not commit when no writable calendar can be resolved", () => {
  const create = createMock();

  const committed = commitDuplicateEvent({
    source: timedEvent,
    calendars: [readOnlyCalendar],
    defaultCalendarId: undefined,
    create,
  });

  expect(committed).toBe(false);
  expect(create).not.toHaveBeenCalled();
});

test("preserves series rules on the duplicate", () => {
  const create = createMock();

  commitDuplicateEvent({
    source: seriesEvent,
    calendars: [writableCalendar],
    defaultCalendarId: undefined,
    create,
  });

  const [input] = create.mock.calls[0];
  expect(input.recurrence).toEqual({
    kind: "series",
    rules: ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE"],
  });
});
