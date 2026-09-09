import { calendar, type calendar_v3 } from "@googleapis/calendar";
import { OAuth2Client } from "google-auth-library";
import { type EventSchedule } from "@core/types/event.contracts";
import { type Attendee } from "@core/types/event-attendance.contracts";
import {
  type gCalendar,
  type gSchema$Event,
  type gSchema$Events,
} from "@core/types/gcal";
import { type SyncEventContent } from "@core/types/sync/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { googleColorIdFields } from "@sync/providers/google/google-color.map";
import {
  googleFailureCause,
  googleStatus,
} from "@sync/providers/google/google-error";
import {
  mapConference,
  normalizeGoogleEvent,
} from "@sync/providers/google/google-event.normalizer";
import { GOOGLE_REQUEST_TIMEOUT_MS } from "@sync/providers/google/google-http.constants";
import { googleInstanceEventId } from "@sync/providers/google/google-instance-id";
import {
  type ProviderEvent,
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

// The Google event calls the writer makes. Depending on this narrow interface
// (not the concrete googleapis client) lets tests script results and errors
// without a network round-trip or module mocking. `get` throws on 404 like the
// real client; the adapter turns that into a null/idempotent result.
export interface GoogleEventsApi {
  insert(params: {
    calendarId: string;
    requestBody: gSchema$Event;
    sendUpdates: string;
    conferenceDataVersion?: 1;
  }): Promise<gSchema$Event>;
  patch(params: {
    calendarId: string;
    eventId: string;
    requestBody: gSchema$Event;
    sendUpdates: string;
    ifMatch: string | null;
    // Required to write eventLabelId. Under version 1, colorId is ignored —
    // callers that both clear a label and set a slot color must use two
    // patches (label clear at v1, then colorId at the default v0).
    eventLabelVersion?: 1;
  }): Promise<gSchema$Event>;
  delete(params: {
    calendarId: string;
    eventId: string;
    sendUpdates: string;
    ifMatch: string | null;
  }): Promise<void>;
  get(params: { calendarId: string; eventId: string }): Promise<gSchema$Event>;
  // originalStart, when given, filters to the single instance whose
  // ORIGINAL scheduled start matches it — resolving one occurrence's own
  // provider identity without guessing a time window (a rescheduled
  // instance's CURRENT start can differ arbitrarily from its identity).
  instances(params: {
    calendarId: string;
    eventId: string;
    originalStart: string;
  }): Promise<gSchema$Events>;
}

export type GoogleEventsApiFactory = (accessToken: string) => GoogleEventsApi;

// Thin googleapis wrapper so tests can drive the real insert/patch param
// mapping without OAuth. `conferenceDataVersion` must reach
// `events.insert` or Google ignores `conferenceData.createRequest`.
export const googleEventsApiFromClient = (gcal: gCalendar): GoogleEventsApi => {
  // An If-Match precondition is passed as a request header; googleapis takes
  // per-call gaxios options as the second argument.
  const ifMatchOptions = (ifMatch: string | null) =>
    ifMatch ? { headers: { "If-Match": ifMatch } } : undefined;
  return {
    async insert({
      calendarId,
      requestBody,
      sendUpdates,
      conferenceDataVersion,
    }) {
      const { data } = await gcal.events.insert({
        calendarId,
        requestBody,
        sendUpdates,
        ...(conferenceDataVersion !== undefined
          ? { conferenceDataVersion }
          : {}),
      });
      return data;
    },
    async patch({
      calendarId,
      eventId,
      requestBody,
      sendUpdates,
      ifMatch,
      eventLabelVersion,
    }) {
      const { data } = await gcal.events.patch(
        {
          calendarId,
          eventId,
          requestBody,
          sendUpdates,
          // Installed @googleapis/calendar types predate event labels.
          ...(eventLabelVersion !== undefined ? { eventLabelVersion } : {}),
        } as calendar_v3.Params$Resource$Events$Patch,
        ifMatchOptions(ifMatch),
      );
      return data;
    },
    async delete({ calendarId, eventId, sendUpdates, ifMatch }) {
      await gcal.events.delete(
        { calendarId, eventId, sendUpdates },
        ifMatchOptions(ifMatch),
      );
    },
    async get({ calendarId, eventId }) {
      const { data } = await gcal.events.get({ calendarId, eventId });
      return data;
    },
    async instances({ calendarId, eventId, originalStart }) {
      const { data } = await gcal.events.instances({
        calendarId,
        eventId,
        originalStart,
      });
      return data;
    },
  };
};

const defaultApiFactory: GoogleEventsApiFactory = (accessToken) => {
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: accessToken });
  const gcal: gCalendar = calendar({
    version: "v3",
    auth,
    timeout: GOOGLE_REQUEST_TIMEOUT_MS,
  });
  return googleEventsApiFromClient(gcal);
};

// Google implementation of the event mutation port. Create is idempotent at a
// caller-chosen id, patch and delete can be conditioned on a version, and
// provider errors are classified into neutral, caller-actionable reasons.
export class GoogleEventWriter implements ProviderEventWriter {
  #makeApi: GoogleEventsApiFactory;

  constructor(makeApi: GoogleEventsApiFactory = defaultApiFactory) {
    this.#makeApi = makeApi;
  }

  async createEvent(input: ProviderCreateInput): Promise<ProviderWriteResult> {
    const api = this.#makeApi(input.accessToken);
    const requestBody: gSchema$Event = {
      id: input.providerEventId,
      ...toGoogleBody(
        input.content,
        input.schedule,
        input.recurrence,
        input.attendees,
      ),
      ...(input.guestsCanInviteOthers !== undefined
        ? { guestsCanInviteOthers: input.guestsCanInviteOthers }
        : {}),
      ...(input.createConference
        ? {
            conferenceData: {
              createRequest: {
                requestId: input.providerEventId,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
          }
        : {}),
    };

    try {
      const created = await api.insert({
        calendarId: input.calendarId,
        requestBody,
        sendUpdates: toSendUpdates(input.invitation),
        ...(input.createConference ? { conferenceDataVersion: 1 } : {}),
      });
      return toResult(created);
    } catch (error) {
      // A duplicate id means a prior attempt already created it: read it back
      // and report success so a retry is a no-op, not a failure. The read-back
      // has its own try so a failed lookup is classified (and redacted) too,
      // never leaked as a raw provider error.
      if (googleStatus(error) === 409) {
        try {
          const existing = await api.get({
            calendarId: input.calendarId,
            eventId: input.providerEventId,
          });
          return toResult(existing);
        } catch (getError) {
          throw classifyWriteError(getError);
        }
      }
      if (googleStatus(error) === 400) {
        throw googleUnsupportedCapability(
          error,
          "Google declined to change this event",
        );
      }
      throw classifyWriteError(error);
    }
  }

  async patchEvent(input: ProviderPatchInput): Promise<ProviderWriteResult> {
    const api = this.#makeApi(input.accessToken);
    try {
      let ifMatch = input.expectedVersion;
      // A slot color must also clear any custom event label. Labels supersede
      // colorId on read and rehydrate as Compass colorHex. Google only accepts
      // eventLabelId writes under eventLabelVersion=1, and that version ignores
      // colorId — so clear the label first, then write colorId at default v0.
      if (typeof input.content.color === "string") {
        const cleared = await api.patch({
          calendarId: input.calendarId,
          eventId: input.providerEventId,
          requestBody: { eventLabelId: "" },
          sendUpdates: "none",
          ifMatch,
          eventLabelVersion: 1,
        });
        if (cleared.etag) ifMatch = cleared.etag;
      }
      const patched = await api.patch({
        calendarId: input.calendarId,
        eventId: input.providerEventId,
        requestBody: toGoogleBody(
          input.content,
          input.schedule,
          input.recurrence,
          input.attendees,
          input.providerManaged,
        ),
        sendUpdates: toSendUpdates(input.invitation),
        ifMatch,
      });
      return toResult(patched);
    } catch (error) {
      if (googleStatus(error) === 400) {
        throw googleUnsupportedCapability(
          error,
          "Google declined to change this event",
        );
      }
      throw classifyWriteError(error);
    }
  }

  async deleteEvent(input: ProviderDeleteInput): Promise<void> {
    const api = this.#makeApi(input.accessToken);
    try {
      await api.delete({
        calendarId: input.calendarId,
        eventId: input.providerEventId,
        sendUpdates: toSendUpdates(input.invitation),
        ifMatch: input.expectedVersion,
      });
    } catch (error) {
      // Already gone: a delete of an absent event is a success, so retries and
      // races converge instead of surfacing a spurious failure.
      if (isNotFound(error)) return;
      // A 400 on a delete-by-known-id is Google declining the operation for
      // this event, not a malformed request — e.g. cancelling one occurrence
      // of a contact-linked birthday event is unsupported. Classifying it as
      // permanentProviderError surfaced a retryable 502 the client could
      // never resolve; a typed capability refusal maps to an honest,
      // non-retryable error instead.
      if (googleStatus(error) === 400) {
        throw googleUnsupportedCapability(
          error,
          "Google declined to delete this event",
        );
      }
      throw classifyWriteError(error);
    }
  }

  async fetchEvent(
    input: ProviderFetchInput,
  ): Promise<ProviderEventRead | null> {
    const api = this.#makeApi(input.accessToken);
    try {
      const event = await api.get({
        calendarId: input.calendarId,
        eventId: input.providerEventId,
      });
      return normalizeGoogleEvent(event);
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
      const item = await resolveInstanceItem(api, input);
      if (!item) return null;
      return readResolvedInstance(item, input);
    } catch (error) {
      // A 404 on the SERIES itself (not just the instance) surfaces here too
      // — both mean "nothing to resolve", so both return null rather than
      // distinguishing (the caller treats either the same way).
      if (isNotFound(error)) return null;
      throw classifyWriteError(error);
    }
  }
}

function toResult(event: gSchema$Event): ProviderWriteResult {
  if (!event.id || !event.etag) {
    throw new ProviderWriteError(
      "permanentProviderError",
      "Google returned an event without an id or etag",
    );
  }
  const conference = mapConference(event);
  return {
    providerEventId: event.id,
    providerVersion: event.etag,
    ...(event.iCalUID ? { icalUid: event.iCalUID } : {}),
    ...(conference ? { conference } : {}),
  };
}

// Map neutral content/schedule/recurrence to a Google event body. Because
// events.patch merges by key, keys that must be cleared are set to null rather
// than omitted — an omitted key is left unchanged on Google, and leaving the
// other schedule kind's keys behind makes Google reject a start holding both a
// date and a dateTime.
//
// organizer and conference are deliberately NOT written. Compass is not
// authoritative for them (the organizer is fixed by the provider at creation,
// and conference management is a separate concern), so those are
// read-reflected only. Attendees are written ONLY when the write intends a
// guest-list edit — `attendees` present, produced upstream from an
// attendeesEdit "replace" command by merging against freshly fetched provider
// state — because a Google write replaces the WHOLE attendees array. When
// `attendees` is absent (every "preserve"/legacy command), the key is omitted
// and patch's merge-by-key semantics leave the provider's own guest list
// untouched, exactly as before. content.attendees itself is read-reflected
// state and never reaches the body. sendUpdates still notifies existing
// attendees of the changes we do write.
function toGoogleBody(
  content: SyncEventContent,
  schedule: EventSchedule,
  recurrence: ProviderWriteRecurrence,
  attendees?: readonly Attendee[],
  providerManaged?: true,
): gSchema$Event {
  if (providerManaged) {
    return {
      ...googleColorIdFields(content.color),
      ...attendeesField(attendees),
    };
  }
  return {
    summary: content.title,
    description: content.description,
    location: content.location,
    ...googleColorIdFields(content.color),
    ...scheduleFields(schedule),
    ...recurrenceField(recurrence),
    ...attendeesField(attendees),
  };
}

// Present (even empty) replaces Google's whole attendees array; absent omits
// the key so merge-by-key leaves the provider's list alone. Retained entries
// carry the provider's own responseStatus back, so a guest-list write never
// resets anyone's RSVP; displayName is omitted when unknown rather than sent
// as null.
function attendeesField(
  attendees: readonly Attendee[] | undefined,
): Partial<Pick<calendar_v3.Schema$Event, "attendees">> {
  if (!attendees) return {};
  return {
    attendees: attendees.map(({ email, displayName, responseStatus }) => ({
      email,
      responseStatus,
      ...(displayName === null ? {} : { displayName }),
    })),
  };
}

// "series" writes rules; "single" clears them with an explicit null (patch
// merges by key, so an omitted key would leave a prior series' rules on a
// converted event); "instance" omits the key — Google rejects a `recurrence`
// key at all on an event resolved off a series via fetchInstanceAt.
function recurrenceField(
  recurrence: ProviderWriteRecurrence,
): Partial<Pick<calendar_v3.Schema$Event, "recurrence">> {
  if (recurrence.kind === "series")
    return { recurrence: [...recurrence.rules] };
  if (recurrence.kind === "single") return { recurrence: null };
  return {};
}

function scheduleFields(
  schedule: EventSchedule,
): Pick<calendar_v3.Schema$Event, "start" | "end"> {
  if (schedule.kind === "timed") {
    return {
      start: {
        date: null,
        dateTime: schedule.start,
        timeZone: schedule.timeZone,
      },
      end: { date: null, dateTime: schedule.end, timeZone: schedule.timeZone },
    };
  }
  return {
    start: { date: schedule.start, dateTime: null, timeZone: null },
    end: { date: schedule.end, dateTime: null, timeZone: null },
  };
}

// Google reports an all-day instance's original start as a bare date
// (`originalStartTime: { date: "2026-08-08" }`), never a dateTime — so the
// `originalStart` filter on events.instances must be sent in that same date
// form, or it matches nothing and the occurrence resolves to null. Compass's
// recurrenceId is always a full ISO datetime (`2026-08-08T00:00:00.000Z` for
// an all-day instant), so an all-day lookup truncates to its date component;
// a timed lookup is sent through unchanged.
function toOriginalStartFilter(
  originalStartAt: string,
  scheduleKind: "timed" | "allDay",
): string {
  if (scheduleKind === "timed") return originalStartAt;
  return dayjs
    .utc(originalStartAt)
    .format(dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT);
}

function toRfc3339UtcMidnight(originalStartAt: string): string {
  return dayjs.utc(originalStartAt).format(dayjs.DateFormat.RFC3339);
}

function isOccurrenceItem(
  item: gSchema$Event | undefined,
  seriesProviderEventId: string,
): item is gSchema$Event {
  return Boolean(item?.id && item.id !== seriesProviderEventId);
}

async function resolveInstanceItem(
  api: GoogleEventsApi,
  input: ProviderInstanceFetchInput,
): Promise<gSchema$Event | null> {
  const filters =
    input.scheduleKind === "allDay"
      ? [
          toOriginalStartFilter(input.originalStartAt, "allDay"),
          toRfc3339UtcMidnight(input.originalStartAt),
        ]
      : [input.originalStartAt];

  let sawBadRequest = false;
  for (let index = 0; index < filters.length; index += 1) {
    const originalStart = filters[index] as string;
    try {
      const page = await api.instances({
        calendarId: input.calendarId,
        eventId: input.seriesProviderEventId,
        originalStart,
      });
      const item = page.items?.[0];
      if (isOccurrenceItem(item, input.seriesProviderEventId)) return item;
      // Empty page or the series master itself: do not retry RFC3339 unless
      // Google rejected the previous filter. Fall through to constructed GET.
      break;
    } catch (error) {
      if (isNotFound(error)) return null;
      if (googleStatus(error) !== 400) throw error;
      sawBadRequest = true;
      if (index >= filters.length - 1) break;
    }
  }

  try {
    // GET of the minted `{seriesId}_{originalStart}` id still addresses the
    // occurrence after it was moved — the suffix is the original start.
    const event = await api.get({
      calendarId: input.calendarId,
      eventId: googleInstanceEventId(
        input.seriesProviderEventId,
        input.originalStartAt,
        input.scheduleKind,
      ),
    });
    if (isOccurrenceItem(event, input.seriesProviderEventId)) return event;
    return null;
  } catch (error) {
    if (isNotFound(error)) return null;
    if (sawBadRequest && googleStatus(error) === 400) return null;
    throw error;
  }
}

function readResolvedInstance(
  item: gSchema$Event,
  input: ProviderInstanceFetchInput,
): ProviderEventRead | null {
  if (!isOccurrenceItem(item, input.seriesProviderEventId)) return null;
  try {
    return normalizeGoogleEvent(item);
  } catch (error) {
    if (!(error instanceof ProviderEventError)) throw error;
    return identityOnlyInstance(item, input);
  }
}

// Delete (and a subsequent patch) only need the instance's provider id. A
// content/schedule the contract rejects must not strand the command pending.
function identityOnlyInstance(
  item: gSchema$Event,
  input: ProviderInstanceFetchInput,
): ProviderEvent {
  const start = dayjs.utc(input.originalStartAt);
  const schedule =
    input.scheduleKind === "allDay"
      ? {
          kind: "allDay" as const,
          start: start.format(dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT),
          end: start
            .add(1, "day")
            .format(dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT),
        }
      : {
          kind: "timed" as const,
          start: input.originalStartAt,
          end: input.originalStartAt,
          timeZone: "UTC",
        };
  return {
    kind: "event",
    providerEventId: item.id as string,
    providerVersion: item.etag?.trim() || "missing",
    providerUpdatedAt: item.updated ?? null,
    content: {
      title: "",
      description: "",
      location: "",
      organizer: null,
      attendees: [],
      conference: null,
    },
    schedule: schedule as EventSchedule,
    busy: true,
    recurrence: {
      kind: "instance",
      seriesProviderId: input.seriesProviderEventId,
      recurrenceId: new Date(input.originalStartAt).toISOString(),
    },
  };
}

// Google's sendUpdates values are exactly the neutral invitation intents.
function toSendUpdates(invitation: InvitationIntent): string {
  return invitation;
}

// Google 403 reasons that mean "slow down", not "forbidden" — retryable.
const RETRYABLE_403_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "quotaExceeded",
  "dailyLimitExceeded",
]);

const GOOGLE_WRITE_ERROR_POLICY: ProviderWriteErrorPolicy = {
  status: googleStatus,
  cause: googleFailureCause,
  credentialRejectedMessage: "Google rejected the credential",
  writeRejectedMessage: "Google rejected the write",
};

function googleUnsupportedCapability(
  error: unknown,
  message: string,
): ProviderWriteError {
  return new ProviderWriteError("unsupportedCapability", message, {
    cause: googleFailureCause(error),
  });
}

function classifyWriteError(error: unknown): ProviderWriteError {
  // An already-classified error (e.g. a missing-identity result) must not be
  // re-wrapped as transient just because it carries no HTTP status.
  if (error instanceof ProviderWriteError) return error;
  // A per-event normalize failure has no HTTP status. Mapping it to
  // `transient` left occurrence deletes pending forever (HTTP 502 on every
  // retry). The lookup path now recovers identity without a full read; any
  // leftover throw is a permanent rejection, not a blip.
  if (error instanceof ProviderEventError) {
    return new ProviderWriteError("permanentProviderError", error.message, {
      cause: googleFailureCause(error),
    });
  }
  // A quota 403 is retryable. Every other 403 falls through to the shared
  // table, which reads it as a calendar this authorization cannot write.
  if (googleStatus(error) === 403 && hasRetryable403Reason(error)) {
    return new ProviderWriteError(
      "transient",
      "Google rate limited the write",
      { cause: googleFailureCause(error) },
    );
  }
  return classifyProviderWriteError(error, GOOGLE_WRITE_ERROR_POLICY);
}

function isNotFound(error: unknown): boolean {
  return isNotFoundStatus(googleStatus(error));
}

function hasRetryable403Reason(error: unknown): boolean {
  const errors = (
    error as {
      response?: { data?: { error?: { errors?: Array<{ reason?: string }> } } };
    }
  )?.response?.data?.error?.errors;
  return Boolean(
    errors?.some((e) => e.reason && RETRYABLE_403_REASONS.has(e.reason)),
  );
}

// Google event ids must be base32hex (0-9, a-v), 5-1024 chars. A Compass
// ObjectId hex string is a strict subset, so it is a valid, deterministic id
// as-is — using it makes a create idempotent without a separate mapping.
const BASE32HEX_ID = /^[0-9a-v]{5,1024}$/;

export function deriveGoogleEventId(compassEventId: string): string {
  const id = compassEventId.toLowerCase();
  if (!BASE32HEX_ID.test(id)) {
    throw new Error(
      "Compass event id is not a valid Google event id (base32hex, 5-1024 chars)",
    );
  }
  return id;
}
