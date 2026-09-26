import { EventScheduleSchema } from "@core/types/event.contracts";
import {
  type Attendee,
  type Conference,
  ConferenceSchema,
  type Organizer,
} from "@core/types/event-attendance.contracts";
import { withColor, withColorHex } from "@core/types/event-color.contracts";
import { SyncEventContentSchema } from "@core/types/sync/event.contracts";
import { TimezoneSchema } from "@core/types/type.utils";
import dayjs from "@core/util/date/dayjs";
import { outlookCategoryNameToSlot } from "@sync/providers/microsoft/microsoft-event-category.map";
import { toRRule } from "@sync/providers/microsoft/microsoft-recurrence";
import { UnsupportedRecurrenceError } from "@sync/providers/microsoft/microsoft-recurrence.error";
import { type GraphPatternedRecurrence } from "@sync/providers/microsoft/microsoft-recurrence.types";
import {
  ProviderEventError,
  type ProviderEventRead,
  type ProviderEventRecurrence,
} from "@sync/providers/provider-event.port";

const RFC3339_OFFSET = dayjs.DateFormat.RFC3339_OFFSET;
const DATE_ONLY = dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT;

const NO_CATEGORY_COLORS: ReadonlyMap<string, string> = new Map();

const MEETING_PROVIDER_LABELS: Readonly<Record<string, string>> = {
  teamsForBusiness: "Microsoft Teams",
  teamsForConsumer: "Microsoft Teams",
  skypeForBusiness: "Skype for Business",
  skypeForConsumer: "Skype",
};

export interface NormalizeMicrosoftEventOptions {
  readonly allowOccurrence?: boolean;
}

export interface GraphDateTimeTimeZone {
  readonly dateTime?: string;
  readonly timeZone?: string;
}

export interface GraphEmailAddress {
  readonly name?: string;
  readonly address?: string;
}

export interface GraphAttendee {
  readonly type?: string;
  readonly emailAddress?: GraphEmailAddress;
  readonly status?: { readonly response?: string };
}

export interface GraphItemBody {
  readonly contentType?: string;
  readonly content?: string;
}

export interface GraphOnlineMeeting {
  readonly joinUrl?: string;
}

export interface GraphEvent {
  readonly id?: string;
  readonly ["@odata.etag"]?: string;
  readonly lastModifiedDateTime?: string;
  readonly iCalUId?: string;
  readonly subject?: string;
  readonly bodyPreview?: string;
  readonly body?: GraphItemBody;
  readonly location?: { readonly displayName?: string };
  readonly organizer?: { readonly emailAddress?: GraphEmailAddress };
  readonly attendees?: readonly GraphAttendee[];
  readonly isCancelled?: boolean;
  readonly showAs?: string;
  readonly isAllDay?: boolean;
  readonly start?: GraphDateTimeTimeZone;
  readonly end?: GraphDateTimeTimeZone;
  readonly type?: string;
  readonly recurrence?: GraphPatternedRecurrence;
  readonly seriesMasterId?: string;
  readonly originalStart?: string;
  readonly onlineMeeting?: GraphOnlineMeeting;
  readonly onlineMeetingProvider?: string;
  readonly categories?: readonly string[];
  readonly isReminderOn?: boolean;
}

// Normalize one Microsoft Graph event read into a provider-neutral read. A
// cancelled event becomes a cancellation; an active event becomes a full read.
// Throws ProviderEventError only when the read is structurally unusable, never
// for merely sparse events.
//
// `masterCategories` maps the owning calendar's Outlook category display names
// to hex colors (like Google's colorLabels). Omit when none are known; a
// category name absent from the map simply leaves the event uncolored.
export function normalizeMicrosoftEvent(
  item: GraphEvent,
  masterCategories: ReadonlyMap<string, string> = NO_CATEGORY_COLORS,
  options: NormalizeMicrosoftEventOptions = {},
): ProviderEventRead {
  if (item.type === "occurrence" && !options.allowOccurrence) {
    throw new ProviderEventError(
      "unmappableContent",
      "Occurrence rows must not be normalized; the reader must not request them",
    );
  }

  const providerEventId = requireId(item);

  if (item.isCancelled) {
    return {
      kind: "cancellation",
      providerEventId,
      providerVersion: item["@odata.etag"] ?? "",
      series: cancellationSeries(item),
    };
  }

  const providerVersion = requireVersion(item);

  return {
    kind: "event",
    providerEventId,
    providerVersion,
    providerUpdatedAt: item.lastModifiedDateTime ?? null,
    content: mapContent(item, masterCategories),
    schedule: mapSchedule(item),
    busy: item.showAs !== "free",
    ...(item.iCalUId ? { icalUid: item.iCalUId } : {}),
    recurrence: mapRecurrence(item),
  };
}

function requireId(item: GraphEvent): string {
  if (!item.id) {
    throw new ProviderEventError("missingIdentity", "Event carried no id");
  }
  return item.id;
}

function requireVersion(item: GraphEvent): string {
  if (!item["@odata.etag"]) {
    throw new ProviderEventError("missingIdentity", "Event carried no etag");
  }
  return item["@odata.etag"];
}

function cancellationSeries(
  item: GraphEvent,
): { seriesProviderId: string; recurrenceId: string } | null {
  if (item.seriesMasterId && item.originalStart) {
    return {
      seriesProviderId: item.seriesMasterId,
      recurrenceId: toCanonicalRecurrenceId(item.originalStart),
    };
  }
  return null;
}

function mapContent(
  item: GraphEvent,
  masterCategories: ReadonlyMap<string, string>,
) {
  const categoryName = item.categories?.[0];
  const colorFromCategory = categoryName
    ? outlookCategoryNameToSlot(categoryName)
    : undefined;
  const colorHex =
    categoryName && colorFromCategory === undefined
      ? masterCategories.get(categoryName)
      : undefined;
  const parsed = SyncEventContentSchema.safeParse({
    title: item.subject ?? "",
    description: mapDescription(item),
    location: item.location?.displayName ?? "",
    organizer: mapOrganizer(item.organizer),
    attendees: mapAttendees(item.attendees),
    conference: mapConference(item),
    ...withColor(colorFromCategory),
    ...withColorHex(colorHex),
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

function mapDescription(item: GraphEvent): string {
  const body = item.body;
  if (body?.content !== undefined) {
    if (body.contentType?.toLowerCase() === "html") {
      return stripHtml(body.content);
    }
    return body.content;
  }
  return item.bodyPreview ?? "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

function mapOrganizer(organizer: GraphEvent["organizer"]): Organizer | null {
  const email = organizer?.emailAddress?.address;
  if (!email) return null;
  return {
    email,
    displayName: organizer.emailAddress?.name?.trim() || null,
  };
}

const GRAPH_RESPONSE_TO_COMPASS: Readonly<
  Record<string, Attendee["responseStatus"]>
> = {
  accepted: "accepted",
  declined: "declined",
  tentativelyAccepted: "tentative",
  none: "needsAction",
  notResponded: "needsAction",
  organizer: "accepted",
};

function mapAttendees(attendees: GraphEvent["attendees"]): Attendee[] {
  return (attendees ?? [])
    .filter((attendee) => attendee.type !== "resource")
    .filter((attendee) => Boolean(attendee.emailAddress?.address))
    .map((attendee) => ({
      email: attendee.emailAddress!.address as string,
      displayName: attendee.emailAddress?.name?.trim() || null,
      responseStatus:
        GRAPH_RESPONSE_TO_COMPASS[attendee.status?.response ?? ""] ??
        "needsAction",
    }));
}

export function mapConference(item: GraphEvent): Conference | null {
  const url = item.onlineMeeting?.joinUrl;
  if (!url) return null;

  const label =
    (item.onlineMeetingProvider
      ? MEETING_PROVIDER_LABELS[item.onlineMeetingProvider]
      : undefined) ?? null;

  const parsed = ConferenceSchema.safeParse({ url, label });
  return parsed.success ? parsed.data : null;
}

function mapSchedule(item: GraphEvent) {
  const { start, end } = item;
  if (!start || !end) {
    throw new ProviderEventError(
      "unmappableSchedule",
      "Event has no start or end",
    );
  }

  if (item.isAllDay) {
    const startDate = extractDatePart(start);
    const endDate = extractDatePart(end);
    if (!startDate || !endDate) {
      throw new ProviderEventError(
        "unmappableSchedule",
        "All-day event start/end could not be resolved to dates",
      );
    }
    return parseSchedule({
      kind: "allDay",
      start: startDate,
      end: endDate,
    });
  }

  if (start.dateTime && end.dateTime) {
    const timeZone = toIanaTimeZone(start.timeZone ?? end.timeZone ?? "UTC");
    return parseSchedule({
      kind: "timed",
      start: toOffsetIso(start, timeZone),
      end: toOffsetIso(end, timeZone),
      timeZone,
    });
  }

  throw new ProviderEventError(
    "unmappableSchedule",
    "Event start/end could not be resolved to a schedule",
  );
}

function extractDatePart(value: GraphDateTimeTimeZone): string | null {
  if (!value.dateTime) return null;
  const parsed = dayjs.utc(value.dateTime);
  if (!parsed.isValid()) return null;
  return parsed.format(DATE_ONLY);
}

function toIanaTimeZone(timeZone: string): string {
  return TimezoneSchema.safeParse(timeZone).success ? timeZone : "UTC";
}

function parseSchedule(candidate: unknown) {
  const parsed = EventScheduleSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ProviderEventError(
      "unmappableSchedule",
      "Event start/end could not be resolved to a schedule",
      { cause: parsed.error },
    );
  }
  return parsed.data;
}

function mapRecurrence(item: GraphEvent): ProviderEventRecurrence {
  if (item.type === "seriesMaster" && item.recurrence) {
    try {
      return { kind: "seriesMaster", rules: toRRule(item.recurrence) };
    } catch (error) {
      if (error instanceof UnsupportedRecurrenceError) {
        throw new ProviderEventError(
          "unmappableContent",
          "Event recurrence could not be converted to RRULE",
          { cause: error },
        );
      }
      throw error;
    }
  }
  if (item.type === "exception" && item.seriesMasterId && item.originalStart) {
    return {
      kind: "instance",
      seriesProviderId: item.seriesMasterId,
      recurrenceId: toCanonicalRecurrenceId(item.originalStart),
    };
  }
  if (item.seriesMasterId && item.originalStart) {
    return {
      kind: "instance",
      seriesProviderId: item.seriesMasterId,
      recurrenceId: toCanonicalRecurrenceId(item.originalStart),
    };
  }
  return { kind: "single" };
}

function toCanonicalRecurrenceId(originalStart: string): string {
  return new Date(originalStart).toISOString();
}

function toOffsetIso(value: GraphDateTimeTimeZone, timeZone: string): string {
  if (!value.dateTime) {
    throw new ProviderEventError(
      "unmappableSchedule",
      "Event date-time had no dateTime",
    );
  }
  const anchored = dayjs(value.dateTime).tz(timeZone);
  return anchored.format(RFC3339_OFFSET);
}
