import ICAL from "ical.js";
import {
  type Attendee,
  type Conference,
  ConferenceSchema,
  type Organizer,
} from "@core/types/event-attendance.contracts";
import { SyncEventContentSchema } from "@core/types/sync/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { appleInstanceEventId } from "@sync/providers/apple/apple-instance-id";
import {
  ProviderEventError,
  type ProviderEventRead,
  type ProviderEventRecurrence,
} from "@sync/providers/provider-event.port";
import { parseProviderSchedule } from "@sync/providers/provider-schedule.util";
import { toIanaTimeZoneOrUtc } from "@sync/providers/provider-timezone.util";

const RFC3339_OFFSET = dayjs.DateFormat.RFC3339_OFFSET;
const COMPACT_DATE = dayjs.DateFormat.YEAR_MONTH_DAY_COMPACT_FORMAT;
const DATE_ONLY = dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT;

export interface AppleEventResourceInput {
  readonly ics: string;
  readonly href: string;
  readonly etag: string;
  /** Wall-clock zone for floating DTSTART/DTEND (the connection's zone). */
  readonly connectionTimeZone: string;
}

interface AppleResourceContext {
  readonly href: string;
  readonly etag: string;
  readonly connectionTimeZone: string;
}

// Normalize one CalDAV ICS resource (one master VEVENT plus zero or more
// RECURRENCE-ID siblings) into provider-neutral reads. Throws
// ProviderEventError only when a VEVENT is structurally unusable; the reader
// counts those as skipped.
export function normalizeAppleEventResource(
  input: AppleEventResourceInput,
): ProviderEventRead[] {
  let component: ICAL.Component;
  try {
    component = new ICAL.Component(ICAL.parse(input.ics));
  } catch (error) {
    throw new ProviderEventError(
      "unmappableSchedule",
      "ICS could not be parsed",
      {
        cause: error,
      },
    );
  }

  for (const timezone of component.getAllSubcomponents("vtimezone")) {
    ICAL.TimezoneService.register(timezone);
  }

  const vevents = component.getAllSubcomponents("vevent");
  if (vevents.length === 0) {
    throw new ProviderEventError(
      "missingIdentity",
      "ICS resource had no VEVENT",
    );
  }

  const context: AppleResourceContext = {
    href: input.href,
    etag: input.etag,
    connectionTimeZone: input.connectionTimeZone,
  };

  const masters = vevents.filter(
    (vevent) => !vevent.hasProperty("recurrence-id"),
  );
  const exceptions = vevents.filter((vevent) =>
    vevent.hasProperty("recurrence-id"),
  );

  const reads: ProviderEventRead[] = [];
  for (const master of masters) {
    reads.push(normalizeAppleVevent(master, context, null));
  }
  for (const exception of exceptions) {
    reads.push(
      normalizeAppleVevent(
        exception,
        context,
        masters[0]?.getFirstPropertyValue("uid") as string | undefined,
      ),
    );
  }
  return reads;
}

function normalizeAppleVevent(
  vevent: ICAL.Component,
  context: AppleResourceContext,
  masterUid: string | null | undefined,
): ProviderEventRead {
  const recurrenceIdProp = vevent.getFirstProperty("recurrence-id");
  if (recurrenceIdProp?.getParameter("range") === "THISANDFUTURE") {
    throw new ProviderEventError(
      "unmappableSchedule",
      "RECURRENCE-ID RANGE=THISANDFUTURE is not supported",
    );
  }

  const uid = requireUid(vevent);
  const isException = Boolean(recurrenceIdProp);
  const providerEventId = isException
    ? instanceProviderEventId(
        uid,
        recurrenceIdProp!,
        context.connectionTimeZone,
      )
    : uid;
  const status = vevent.getFirstPropertyValue("status") as string | undefined;

  if (status === "CANCELLED") {
    return {
      kind: "cancellation",
      providerEventId,
      providerVersion: context.etag,
      series: cancellationSeries(
        uid,
        isException,
        recurrenceIdProp ?? undefined,
        context,
      ),
    };
  }

  const event = new ICAL.Event(vevent);
  const providerUpdatedAt = mapProviderUpdatedAt(vevent);

  return {
    kind: "event",
    providerEventId,
    providerVersion: context.etag,
    providerUpdatedAt,
    content: mapContent(event),
    schedule: mapSchedule(event, context.connectionTimeZone),
    busy: vevent.getFirstPropertyValue("transp") !== "TRANSPARENT",
    icalUid: uid,
    recurrence: mapRecurrence(
      vevent,
      uid,
      isException,
      recurrenceIdProp ?? undefined,
      context,
      masterUid,
    ),
  };
}

function requireUid(vevent: ICAL.Component): string {
  const uid = vevent.getFirstPropertyValue("uid");
  if (typeof uid !== "string" || uid.trim().length === 0) {
    throw new ProviderEventError("missingIdentity", "VEVENT carried no UID");
  }
  return uid;
}

function instanceProviderEventId(
  uid: string,
  recurrenceIdProp: ICAL.Property,
  connectionTimeZone: string,
): string {
  const recurrenceTime = recurrenceIdProp.getFirstValue() as ICAL.Time;
  const scheduleKind = recurrenceTime.isDate ? "allDay" : "timed";
  const recurrenceId = toCanonicalRecurrenceId(
    recurrenceTime,
    scheduleKind,
    connectionTimeZone,
  );
  return appleInstanceEventId(uid, recurrenceId, scheduleKind);
}

function cancellationSeries(
  uid: string,
  isException: boolean,
  recurrenceIdProp: ICAL.Property | undefined,
  context: AppleResourceContext,
): { seriesProviderId: string; recurrenceId: string } | null {
  if (!isException || !recurrenceIdProp) return null;
  const recurrenceTime = recurrenceIdProp.getFirstValue() as ICAL.Time;
  const scheduleKind = recurrenceTime.isDate ? "allDay" : "timed";
  return {
    seriesProviderId: uid,
    recurrenceId: toCanonicalRecurrenceId(
      recurrenceTime,
      scheduleKind,
      context.connectionTimeZone,
    ),
  };
}

function mapProviderUpdatedAt(vevent: ICAL.Component): string | null {
  const lastModified = vevent.getFirstPropertyValue("last-modified") as
    | ICAL.Time
    | undefined;
  if (lastModified) {
    return lastModified.toJSDate().toISOString();
  }
  const dtstamp = vevent.getFirstPropertyValue("dtstamp") as
    | ICAL.Time
    | undefined;
  return dtstamp ? dtstamp.toJSDate().toISOString() : null;
}

function mapContent(event: ICAL.Event) {
  const parsed = SyncEventContentSchema.safeParse({
    title: event.summary ?? "",
    description: event.description ?? "",
    location: event.location ?? "",
    organizer: mapOrganizer(event),
    attendees: mapAttendees(event),
    conference: mapConference(event),
  });
  if (!parsed.success) {
    throw new ProviderEventError(
      "unmappableContent",
      "Event content failed the neutral contract",
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

function mapOrganizer(event: ICAL.Event): Organizer | null {
  const property = event.component.getFirstProperty("organizer");
  if (!property) return null;
  const email = stripMailto(property.getFirstValue() as string);
  if (!email) return null;
  const displayName = stringParam(property, "cn")?.trim();
  return {
    email,
    displayName: displayName || null,
  };
}

const KNOWN_RESPONSES = new Set(["accepted", "declined", "tentative"]);

function mapAttendees(event: ICAL.Event): Attendee[] {
  return event.component
    .getAllProperties("attendee")
    .map((property) => {
      const email = stripMailto(property.getFirstValue() as string);
      if (!email) return null;
      const partstat = stringParam(property, "partstat")?.toLowerCase();
      const displayName = stringParam(property, "cn")?.trim();
      return {
        email,
        displayName: displayName || null,
        responseStatus: KNOWN_RESPONSES.has(partstat ?? "")
          ? (partstat as Attendee["responseStatus"])
          : "needsAction",
      };
    })
    .filter((attendee): attendee is Attendee => attendee !== null);
}

function mapConference(event: ICAL.Event): Conference | null {
  const url = event.component.getFirstPropertyValue("url");
  if (typeof url !== "string" || !url.startsWith("https://")) return null;
  const parsed = ConferenceSchema.safeParse({ url, label: "Link" });
  return parsed.success ? parsed.data : null;
}

function mapSchedule(event: ICAL.Event, connectionTimeZone: string) {
  const start = event.startDate;
  const end = event.endDate;
  if (!start || !end) {
    throw new ProviderEventError(
      "unmappableSchedule",
      "VEVENT has no start or end",
    );
  }

  if (start.isDate && end.isDate) {
    return parseProviderSchedule({
      kind: "allDay",
      start: compactDateToDateOnly(start.toICALString()),
      end: compactDateToDateOnly(end.toICALString()),
    });
  }

  if (!start.isDate && !end.isDate) {
    const timeZone = resolveTimeZone(start, connectionTimeZone);
    return parseProviderSchedule({
      kind: "timed",
      start: toOffsetIso(start, timeZone, connectionTimeZone),
      end: toOffsetIso(end, timeZone, connectionTimeZone),
      timeZone,
    });
  }

  throw new ProviderEventError(
    "unmappableSchedule",
    "VEVENT start/end mixes date and dateTime",
  );
}

function mapRecurrence(
  vevent: ICAL.Component,
  uid: string,
  isException: boolean,
  recurrenceIdProp: ICAL.Property | undefined,
  context: AppleResourceContext,
  masterUid: string | null | undefined,
): ProviderEventRecurrence {
  if (isException && recurrenceIdProp) {
    const recurrenceTime = recurrenceIdProp.getFirstValue() as ICAL.Time;
    const scheduleKind = recurrenceTime.isDate ? "allDay" : "timed";
    return {
      kind: "instance",
      seriesProviderId: masterUid ?? uid,
      recurrenceId: toCanonicalRecurrenceId(
        recurrenceTime,
        scheduleKind,
        context.connectionTimeZone,
      ),
    };
  }

  const rules = collectRecurrenceRules(vevent);
  if (rules.length > 0) {
    return { kind: "seriesMaster", rules };
  }
  return { kind: "single" };
}

function collectRecurrenceRules(vevent: ICAL.Component): readonly string[] {
  const rules: string[] = [];
  const rrule = vevent.getFirstProperty("rrule");
  if (rrule) rules.push(rrule.toICALString());
  for (const exdate of vevent.getAllProperties("exdate")) {
    rules.push(exdate.toICALString());
  }
  for (const rdate of vevent.getAllProperties("rdate")) {
    rules.push(rdate.toICALString());
  }
  return rules;
}

function compactDateToDateOnly(compact: string): string {
  const parsed = dayjs.utc(compact, COMPACT_DATE, true);
  if (!parsed.isValid()) {
    throw new ProviderEventError(
      "unmappableSchedule",
      "All-day date could not be parsed",
    );
  }
  return parsed.format(DATE_ONLY);
}

function resolveTimeZone(time: ICAL.Time, connectionTimeZone: string): string {
  const tzid = time.zone?.tzid;
  if (!tzid || tzid === "floating") {
    return toIanaTimeZoneOrUtc(connectionTimeZone);
  }
  return toIanaTimeZoneOrUtc(tzid);
}

function toOffsetIso(
  time: ICAL.Time,
  timeZone: string,
  connectionTimeZone: string,
): string {
  if (time.isDate) {
    return dayjs
      .utc(compactDateToDateOnly(time.toICALString()))
      .format(RFC3339_OFFSET);
  }

  if (time.zone?.tzid === "floating") {
    const wallClock = time.toICALString();
    const anchored = dayjs.tz(wallClock, "YYYYMMDDTHHmmss", connectionTimeZone);
    if (!anchored.isValid()) {
      throw new ProviderEventError(
        "unmappableSchedule",
        "Floating date-time could not be anchored",
      );
    }
    return anchored.format(RFC3339_OFFSET);
  }

  const anchored = dayjs(time.toJSDate()).tz(timeZone);
  return anchored.format(RFC3339_OFFSET);
}

function toCanonicalRecurrenceId(
  time: ICAL.Time,
  scheduleKind: "timed" | "allDay",
  connectionTimeZone = "UTC",
): string {
  if (scheduleKind === "allDay") {
    return dayjs
      .utc(compactDateToDateOnly(time.toICALString()))
      .toDate()
      .toISOString();
  }
  const offset = toOffsetIso(
    time,
    resolveTimeZone(time, connectionTimeZone),
    connectionTimeZone,
  );
  return new Date(offset).toISOString();
}

function stripMailto(value: string | undefined): string | null {
  if (!value) return null;
  const email = value.replace(/^mailto:/i, "").trim();
  return email.length > 0 ? email : null;
}

function stringParam(
  property: ICAL.Property,
  name: string,
): string | undefined {
  const value = property.getParameter(name);
  return typeof value === "string" ? value : undefined;
}
