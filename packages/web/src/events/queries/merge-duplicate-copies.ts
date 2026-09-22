import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId, type EventId } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import { type DuplicateCopy } from "@web/common/types/web.event.types";
import { type NormalizedEventQueryData } from "./event.query.types";

interface Copy {
  id: EventId;
  event: Event;
  calendar: Calendar;
}

/** Trim and strip a `mailto:` prefix so provider copies correlate reliably. */
function correlationKey(icalUid: string): string {
  let key = icalUid.trim();
  if (key.toLowerCase().startsWith("mailto:")) {
    key = key.slice("mailto:".length).trim();
  }
  return key;
}

/**
 * How a dropped copy is named in the surviving card's accessible label: the
 * account it lives on when that is a different account, else its calendar
 * name. Naming the account for a same-account copy would say nothing ("also
 * on ahab@gmail.com" when the card is already on ahab@gmail.com).
 */
function copyLabel(copy: Copy, winner: Copy): string {
  const { accountEmail, name } = copy.calendar;
  return accountEmail && accountEmail !== winner.calendar.accountEmail
    ? accountEmail
    : name;
}

/**
 * Collapse copies of one meeting that live on two of the user's calendars
 * into a single event, and stamp `duplicateCopies` (surviving event id -> the
 * calendars the other copies came from) onto the returned data for the view
 * model to join onto each GridEvent as `otherCopies` - the same way
 * demoEventIds becomes isDemo.
 *
 * Every provider copy of the same invite carries the same `icalUid`, so two
 * events that share it, start and end at the same instant, and sit on
 * DIFFERENT calendars are one meeting seen twice - whether those calendars
 * belong to one connected account or two. Copies whose times differ are left
 * alone: one of them has genuinely been moved, so they occupy different slots
 * and both belong on the grid.
 *
 * Run this after the visible-calendar filter, so hiding one of the calendars
 * unmerges on its own (the hidden copy is already gone by the time this sees
 * the data), and before the grid view model, so everything downstream - the
 * grid and the Up Next banner alike - sees one event per meeting.
 *
 * Pure: useCalendarEventViewModel memoizes the whole pipeline this belongs to,
 * so there is nothing to cache here.
 */
export function mergeDuplicateCopies(
  data: NormalizedEventQueryData | undefined,
  calendars: Calendar[] | undefined,
  defaultAccountEmail = "",
): NormalizedEventQueryData | undefined {
  if (!data || !calendars) return data;

  // A duplicate needs two calendars to sit on. Skip the per-event pass
  // entirely when there is only one.
  if (calendars.length < 2) return data;

  const calendarsById = new Map(calendars.map((c) => [c.id, c]));

  // Group only events that can possibly merge: they need a correlation key
  // and a calendar to compare against another copy's.
  const groups = new Map<string, Copy[]>();
  for (const id of data.ids) {
    const event = data.entities[id];
    if (!event?.icalUid) continue;
    const calendar = event.calendarId
      ? calendarsById.get(event.calendarId)
      : undefined;
    if (!calendar) continue;
    const { start, end } = event.schedule;
    const groupKey = `${correlationKey(event.icalUid)} ${start} ${end}`;
    const copy: Copy = { id, event, calendar };
    const group = groups.get(groupKey);
    if (group) group.push(copy);
    else groups.set(groupKey, [copy]);
  }

  const dropped = new Set<EventId>();
  const duplicates = new Map<EventId, DuplicateCopy[]>();

  for (const copies of groups.values()) {
    if (copies.length < 2) continue;
    // Two rows on the SAME calendar are never two copies of the meeting; the
    // id de-duplication in normalizeEventList already covers that case.
    if (new Set(copies.map((c) => c.calendar.id)).size < 2) continue;

    // Deterministic winner: the copy on the default calendar's account when
    // one of them is, else the copy whose calendar comes first in the
    // calendars list (the order the server returned, stable per cache entry).
    const rank = (copy: Copy) =>
      copy.calendar.accountEmail === defaultAccountEmail
        ? -1
        : calendars.findIndex((c) => c.id === copy.calendar.id);
    const [winner, ...others] = [...copies].sort((a, b) => rank(a) - rank(b));
    if (!winner || others.length === 0) continue;

    for (const loser of others) dropped.add(loser.id);

    // One accent stop per other calendar: two copies on the same calendar
    // would otherwise paint that color twice.
    const seen = new Set<CalendarId>([winner.calendar.id]);
    const otherCopies: DuplicateCopy[] = [];
    for (const other of others) {
      if (seen.has(other.calendar.id)) continue;
      seen.add(other.calendar.id);
      otherCopies.push({
        label: copyLabel(other, winner),
        backgroundColor: other.calendar.backgroundColor,
      });
    }
    if (otherCopies.length > 0) duplicates.set(winner.id, otherCopies);
  }

  if (dropped.size === 0) return data;

  const ids = data.ids.filter((id) => !dropped.has(id));
  const entities = { ...data.entities };
  for (const id of dropped) delete entities[id];

  return { ...data, ids, entities, duplicateCopies: duplicates };
}
