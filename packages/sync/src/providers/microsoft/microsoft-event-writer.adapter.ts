import { type EventSchedule } from "@core/types/event.contracts";
import { type Attendee } from "@core/types/event-attendance.contracts";
import { type SyncEventContent } from "@core/types/sync/event.contracts";
import dayjs from "@core/util/date/dayjs";
import {
  microsoftFailureCause,
  microsoftStatus,
} from "@sync/providers/microsoft/microsoft-error";
import {
  type GraphEvent,
  mapConference,
  normalizeMicrosoftEvent,
} from "@sync/providers/microsoft/microsoft-event.normalizer";
import { microsoftGraphRequest } from "@sync/providers/microsoft/microsoft-graph-request";
import {
  MICROSOFT_EVENT_SELECT,
  MICROSOFT_GRAPH_BASE_URL,
} from "@sync/providers/microsoft/microsoft-http.constants";
import {
  type GraphCalendarMeetingSettings,
  pickTeamsOnlineMeetingProvider,
  readCachedCalendarMeetingSettings,
} from "@sync/providers/microsoft/microsoft-meeting-providers";
import { fromRRule } from "@sync/providers/microsoft/microsoft-recurrence";
import { UnsupportedRecurrenceError } from "@sync/providers/microsoft/microsoft-recurrence.error";
import {
  type GraphPatternedRecurrence,
  type MicrosoftRecurrenceWriteContext,
} from "@sync/providers/microsoft/microsoft-recurrence.types";
import {
  ProviderEventError,
  type ProviderEventRead,
} from "@sync/providers/provider-event.port";
import {
  type InvitationIntent,
  type ProviderCreateInput,
  type ProviderDeleteInput,
  type ProviderEventWriter,
  type ProviderFetchInput,
  type ProviderInstanceFetchInput,
  type ProviderPatchInput,
  ProviderWriteError,
  type ProviderWriteRecurrence,
  type ProviderWriteResult,
} from "@sync/providers/provider-event-writer.port";
import {
  classifyProviderWriteError,
  isNotFoundStatus,
  type ProviderWriteErrorPolicy,
} from "@sync/providers/provider-write-error";
import { redactedCause } from "@sync/safety/redact-error";

const GRAPH_DATETIME = "YYYY-MM-DD[T]HH:mm:ss.SSS";

// Graph attendee response values Compass writes back on a guest-list edit.
const COMPASS_TO_GRAPH_RESPONSE: Readonly<
  Record<Attendee["responseStatus"], string>
> = {
  accepted: "accepted",
  declined: "declined",
  tentative: "tentativelyAccepted",
  needsAction: "notResponded",
};

interface GraphAttendeeWrite {
  readonly type: "required";
  readonly emailAddress: {
    readonly address: string;
    readonly name?: string;
  };
  readonly status?: { readonly response: string };
}

export interface GraphEventWriteBody {
  readonly subject?: string;
  readonly body?: { readonly contentType: "text"; readonly content: string };
  readonly location?: { readonly displayName: string };
  readonly start?: { readonly dateTime: string; readonly timeZone: "UTC" };
  readonly end?: { readonly dateTime: string; readonly timeZone: "UTC" };
  readonly isAllDay?: boolean;
  readonly showAs?: "free" | "busy" | "tentative" | "oof" | "workingElsewhere";
  readonly recurrence?: GraphPatternedRecurrence | null;
  readonly attendees?: readonly GraphAttendeeWrite[];
  readonly responseRequested?: boolean;
  readonly transactionId?: string;
  readonly isOnlineMeeting?: boolean;
  readonly onlineMeetingProvider?: string;
}

export interface MicrosoftEventWriteApi {
  create(params: {
    calendarId: string;
    body: GraphEventWriteBody;
  }): Promise<GraphEvent>;
  patch(params: {
    eventId: string;
    body: GraphEventWriteBody;
    ifMatch: string | null;
  }): Promise<GraphEvent>;
  delete(params: { eventId: string; ifMatch: string | null }): Promise<void>;
  get(params: { eventId: string }): Promise<GraphEvent>;
  listInstances(params: {
    seriesMasterId: string;
    startDateTime: string;
    endDateTime: string;
  }): Promise<readonly GraphEvent[]>;
  getCalendarMeetingSettings(): Promise<GraphCalendarMeetingSettings>;
}

export type MicrosoftEventWriteApiFactory = (
  accessToken: string,
) => MicrosoftEventWriteApi;

const defaultApiFactory: MicrosoftEventWriteApiFactory = (accessToken) =>
  new FetchMicrosoftEventWriteApi(accessToken);

// Microsoft Graph implementation of the event mutation port. Create is
// idempotent via transactionId, patch and delete can be conditioned on etag,
// and provider errors are classified into neutral, caller-actionable reasons.
//
// Named wart: Graph sends attendee mail on create and on attendee changes even
// when responseRequested is false (invitation "none"). Compass honors "none" by
// setting responseRequested false, but Outlook may still notify attendees.
export class MicrosoftEventWriter implements ProviderEventWriter {
  #makeApi: MicrosoftEventWriteApiFactory;

  constructor(makeApi: MicrosoftEventWriteApiFactory = defaultApiFactory) {
    this.#makeApi = makeApi;
  }

  async createEvent(input: ProviderCreateInput): Promise<ProviderWriteResult> {
    const api = this.#makeApi(input.accessToken);
    let conferenceFields: Pick<
      GraphEventWriteBody,
      "isOnlineMeeting" | "onlineMeetingProvider"
    > = {};

    if (input.createConference) {
      const settings = await readCachedCalendarMeetingSettings(
        input.accessToken,
        api,
      );
      const provider = pickTeamsOnlineMeetingProvider(settings);
      if (provider) {
        conferenceFields = {
          isOnlineMeeting: true,
          onlineMeetingProvider: provider,
        };
      }
    }

    const body = {
      ...toGraphCreateBody(input),
      ...conferenceFields,
    };

    try {
      const created = await api.create({
        calendarId: input.calendarId,
        body,
      });
      return toResult(created);
    } catch (error) {
      throw classifyWriteError(error);
    }
  }

  async patchEvent(input: ProviderPatchInput): Promise<ProviderWriteResult> {
    // providerManaged is a Google-only hint today; Microsoft readers never set
    // the fact, so this adapter ignores it and sends the full body as before.
    const api = this.#makeApi(input.accessToken);
    try {
      const patched = await api.patch({
        eventId: input.providerEventId,
        body: toGraphPatchBody(input),
        ifMatch: input.expectedVersion,
      });
      return toResult(patched);
    } catch (error) {
      throw classifyWriteError(error);
    }
  }

  async deleteEvent(input: ProviderDeleteInput): Promise<void> {
    const api = this.#makeApi(input.accessToken);
    try {
      await api.delete({
        eventId: input.providerEventId,
        ifMatch: input.expectedVersion,
      });
    } catch (error) {
      if (isNotFound(error)) return;
      throw classifyWriteError(error);
    }
  }

  async fetchEvent(
    input: ProviderFetchInput,
  ): Promise<ProviderEventRead | null> {
    const api = this.#makeApi(input.accessToken);
    try {
      const event = await api.get({ eventId: input.providerEventId });
      return normalizeMicrosoftEvent(event);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw classifyWriteError(error);
    }
  }

  async fetchInstanceAt(
    input: ProviderInstanceFetchInput,
  ): Promise<ProviderEventRead | null> {
    const api = this.#makeApi(input.accessToken);
    try {
      const window = instanceLookupWindow(input.originalStartAt);
      const instances = await api.listInstances({
        seriesMasterId: input.seriesProviderEventId,
        startDateTime: window.startDateTime,
        endDateTime: window.endDateTime,
      });
      const match = instances.find((item) =>
        originalStartMatches(item, input.originalStartAt),
      );
      if (!match) return null;
      return normalizeMicrosoftEvent(match, undefined, {
        allowOccurrence: true,
      });
    } catch (error) {
      if (isNotFound(error)) return null;
      throw classifyWriteError(error);
    }
  }
}

function toGraphCreateBody(input: ProviderCreateInput): GraphEventWriteBody {
  return {
    transactionId: input.providerEventId,
    ...toGraphWriteBody(
      input.content,
      input.schedule,
      input.recurrence,
      input.invitation,
      input.attendees,
    ),
  };
}

function toGraphPatchBody(input: ProviderPatchInput): GraphEventWriteBody {
  return toGraphWriteBody(
    input.content,
    input.schedule,
    input.recurrence,
    input.invitation,
    input.attendees,
  );
}

function toGraphWriteBody(
  content: SyncEventContent,
  schedule: EventSchedule,
  recurrence: ProviderWriteRecurrence,
  invitation: InvitationIntent,
  attendees?: readonly Attendee[],
): GraphEventWriteBody {
  return {
    subject: content.title,
    body: {
      contentType: "text",
      content: content.description ?? "",
    },
    location: { displayName: content.location ?? "" },
    ...scheduleFields(schedule),
    showAs: "busy",
    ...recurrenceField(recurrence, schedule),
    ...attendeesField(attendees, invitation),
  };
}

function scheduleFields(
  schedule: EventSchedule,
): Pick<GraphEventWriteBody, "start" | "end" | "isAllDay"> {
  if (schedule.kind === "allDay") {
    return {
      isAllDay: true,
      start: {
        dateTime: `${schedule.start}T00:00:00.000`,
        timeZone: "UTC",
      },
      end: {
        dateTime: `${schedule.end}T00:00:00.000`,
        timeZone: "UTC",
      },
    };
  }

  return {
    isAllDay: false,
    start: {
      dateTime: dayjs(schedule.start).utc().format(GRAPH_DATETIME),
      timeZone: "UTC",
    },
    end: {
      dateTime: dayjs(schedule.end).utc().format(GRAPH_DATETIME),
      timeZone: "UTC",
    },
  };
}

function recurrenceField(
  recurrence: ProviderWriteRecurrence,
  schedule: EventSchedule,
): Pick<GraphEventWriteBody, "recurrence"> | Record<string, never> {
  if (recurrence.kind === "instance") return {};
  if (recurrence.kind === "single") return { recurrence: null };
  try {
    return {
      recurrence: fromRRule(recurrence.rules, recurrenceWriteContext(schedule)),
    };
  } catch (error) {
    if (error instanceof UnsupportedRecurrenceError) {
      throw new ProviderWriteError("permanentProviderError", error.message, {
        cause: redactedCause(error),
      });
    }
    throw error;
  }
}

function recurrenceWriteContext(
  schedule: EventSchedule,
): MicrosoftRecurrenceWriteContext {
  if (schedule.kind === "allDay") {
    return { startDate: schedule.start };
  }
  return {
    startDate: dayjs(schedule.start)
      .tz(schedule.timeZone)
      .format(dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT),
    ianaTimeZone: schedule.timeZone,
  };
}

function attendeesField(
  attendees: readonly Attendee[] | undefined,
  invitation: InvitationIntent,
):
  | Pick<GraphEventWriteBody, "attendees" | "responseRequested">
  | Record<string, never> {
  if (!attendees) return {};
  if (attendees.length === 0) {
    return { attendees: attendees.map(toGraphAttendee) };
  }
  return {
    attendees: attendees.map(toGraphAttendee),
    responseRequested: invitation !== "none",
  };
}

function toGraphAttendee(attendee: Attendee): GraphAttendeeWrite {
  return {
    type: "required",
    emailAddress: {
      address: attendee.email,
      ...(attendee.displayName ? { name: attendee.displayName } : {}),
    },
    status: {
      response: COMPASS_TO_GRAPH_RESPONSE[attendee.responseStatus],
    },
  };
}

function toResult(event: GraphEvent): ProviderWriteResult {
  if (!event.id || !event["@odata.etag"]) {
    throw new ProviderWriteError(
      "permanentProviderError",
      "Microsoft returned an event without an id or etag",
    );
  }
  const conference = mapConference(event);
  return {
    providerEventId: event.id,
    providerVersion: event["@odata.etag"],
    ...(event.iCalUId ? { icalUid: event.iCalUId } : {}),
    ...(conference ? { conference } : {}),
  };
}

function instanceLookupWindow(originalStartAt: string): {
  startDateTime: string;
  endDateTime: string;
} {
  const center = dayjs.utc(originalStartAt);
  return {
    startDateTime: center.subtract(12, "hour").format(GRAPH_DATETIME),
    endDateTime: center.add(12, "hour").format(GRAPH_DATETIME),
  };
}

function originalStartMatches(
  item: GraphEvent,
  originalStartAt: string,
): boolean {
  if (!item.originalStart) return false;
  return toMinuteKey(item.originalStart) === toMinuteKey(originalStartAt);
}

// Exchange keys recurring occurrences at whole minutes: a series created at
// 02:36:12.865Z materializes originalStart 02:36:00Z (observed live, 2026-09-11).
// Graph recurrence frequencies are daily or coarser, so minute precision
// cannot confuse two occurrences of one series.
function toMinuteKey(at: string): string {
  return dayjs.utc(at).startOf("minute").toISOString();
}

const MICROSOFT_WRITE_ERROR_POLICY: ProviderWriteErrorPolicy = {
  status: microsoftStatus,
  cause: microsoftFailureCause,
  credentialRejectedMessage: "Microsoft rejected the credential",
  writeRejectedMessage: "Microsoft rejected the write",
};

function classifyWriteError(error: unknown): ProviderWriteError {
  if (error instanceof ProviderWriteError) return error;
  if (error instanceof ProviderEventError) {
    return new ProviderWriteError("permanentProviderError", error.message, {
      cause: redactedCause(error),
    });
  }
  return classifyProviderWriteError(error, MICROSOFT_WRITE_ERROR_POLICY);
}

function isNotFound(error: unknown): boolean {
  return isNotFoundStatus(microsoftStatus(error));
}

class FetchMicrosoftEventWriteApi implements MicrosoftEventWriteApi {
  #accessToken: string;

  constructor(accessToken: string) {
    this.#accessToken = accessToken;
  }

  create(params: {
    calendarId: string;
    body: GraphEventWriteBody;
  }): Promise<GraphEvent> {
    const calendarId = encodeURIComponent(params.calendarId);
    return this.#request(
      "POST",
      `${MICROSOFT_GRAPH_BASE_URL}/me/calendars/${calendarId}/events`,
      params.body,
    );
  }

  patch(params: {
    eventId: string;
    body: GraphEventWriteBody;
    ifMatch: string | null;
  }): Promise<GraphEvent> {
    const eventId = encodeURIComponent(params.eventId);
    return this.#request(
      "PATCH",
      `${MICROSOFT_GRAPH_BASE_URL}/me/events/${eventId}`,
      params.body,
      params.ifMatch,
    );
  }

  async delete(params: {
    eventId: string;
    ifMatch: string | null;
  }): Promise<void> {
    const eventId = encodeURIComponent(params.eventId);
    await this.#request(
      "DELETE",
      `${MICROSOFT_GRAPH_BASE_URL}/me/events/${eventId}`,
      undefined,
      params.ifMatch,
    );
  }

  get(params: { eventId: string }): Promise<GraphEvent> {
    const eventId = encodeURIComponent(params.eventId);
    const query = new URLSearchParams({ $select: MICROSOFT_EVENT_SELECT });
    return this.#request(
      "GET",
      `${MICROSOFT_GRAPH_BASE_URL}/me/events/${eventId}?${query}`,
    );
  }

  listInstances(params: {
    seriesMasterId: string;
    startDateTime: string;
    endDateTime: string;
  }): Promise<readonly GraphEvent[]> {
    const eventId = encodeURIComponent(params.seriesMasterId);
    const query = new URLSearchParams({
      startDateTime: params.startDateTime,
      endDateTime: params.endDateTime,
      $select: MICROSOFT_EVENT_SELECT,
    });
    return this.#requestCollection(
      "GET",
      `${MICROSOFT_GRAPH_BASE_URL}/me/events/${eventId}/instances?${query}`,
    );
  }

  getCalendarMeetingSettings(): Promise<GraphCalendarMeetingSettings> {
    const query = new URLSearchParams({
      $select: "allowedOnlineMeetingProviders,defaultOnlineMeetingProvider",
    });
    return this.#requestJson(
      "GET",
      `${MICROSOFT_GRAPH_BASE_URL}/me/calendar?${query}`,
    );
  }

  async #request(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    body?: GraphEventWriteBody,
    ifMatch: string | null = null,
  ): Promise<GraphEvent> {
    const headers: Record<string, string> = {
      Prefer: 'outlook.timezone="UTC"',
    };
    if (ifMatch) headers["If-Match"] = ifMatch;

    const data = await microsoftGraphRequest<GraphEvent>({
      accessToken: this.#accessToken,
      url,
      method,
      headers,
      body,
      fallbackError: "microsoft_event_write_failed",
      emptyOk: method === "DELETE",
    });
    return data ?? ({} as GraphEvent);
  }

  async #requestCollection(
    method: "GET",
    url: string,
  ): Promise<readonly GraphEvent[]> {
    const data = await microsoftGraphRequest<{ value?: GraphEvent[] }>({
      accessToken: this.#accessToken,
      url,
      method,
      headers: { Prefer: 'outlook.timezone="UTC"' },
      fallbackError: "microsoft_event_write_failed",
    });
    return data.value ?? [];
  }

  #requestJson<T>(method: "GET", url: string): Promise<T> {
    return microsoftGraphRequest<T>({
      accessToken: this.#accessToken,
      url,
      method,
      headers: { Prefer: 'outlook.timezone="UTC"' },
      fallbackError: "microsoft_event_write_failed",
    });
  }
}
