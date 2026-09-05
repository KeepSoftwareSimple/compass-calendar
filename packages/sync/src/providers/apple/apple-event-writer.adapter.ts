import ICAL from "ical.js";
import { type EventSchedule } from "@core/types/event.contracts";
import { type Attendee } from "@core/types/event-attendance.contracts";
import { type SyncEventContent } from "@core/types/sync/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { normalizeAppleEventResource } from "@sync/providers/apple/apple-event.normalizer";
import {
  type AppleEventPatchField,
  serializeAppleEventCreate,
  serializeAppleEventInstance,
  serializeAppleEventPatch,
} from "@sync/providers/apple/apple-event.serializer";
import {
  appleInstanceEventId,
  type ParsedAppleInstanceId,
  parseAppleInstanceId,
} from "@sync/providers/apple/apple-instance-id";
import {
  type CaldavClient,
  type CaldavResponse,
  createCaldavClient,
} from "@sync/providers/apple/caldav-client";
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
import { redactedCause } from "@sync/safety/redact-error";

const CALDAV_ORIGIN = "https://caldav.icloud.com";
const RFC5545 = dayjs.DateFormat.RFC5545;
const DATE_ONLY = dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT;

export interface AppleEventResourceRef {
  readonly href: string;
  readonly etag: string;
  readonly ics: string;
}

export interface AppleEventWriterApi {
  put(
    url: string,
    ics: string,
    options?: { ifMatch?: string; ifNoneMatch?: string },
  ): Promise<CaldavResponse>;
  get(url: string): Promise<CaldavResponse>;
  delete(url: string, ifMatch?: string): Promise<CaldavResponse>;
  propfind(url: string, props: readonly string[]): Promise<CaldavResponse>;
}

export type AppleEventWriterApiFactory = (
  accessToken: string,
) => AppleEventWriterApi;

export class AppleEventWriter implements ProviderEventWriter {
  #connectionTimeZone: string;
  #makeApi: AppleEventWriterApiFactory;

  constructor(
    options: {
      connectionTimeZone?: string;
      makeApi?: AppleEventWriterApiFactory;
    } = {},
  ) {
    this.#connectionTimeZone = options.connectionTimeZone ?? "UTC";
    this.#makeApi =
      options.makeApi ??
      ((accessToken) => createDefaultAppleEventWriterApi(accessToken));
  }

  async createEvent(input: ProviderCreateInput): Promise<ProviderWriteResult> {
    if (input.createConference) {
      // Apple has no conference capability; booking copy handles the null URL.
    }

    const api = this.#makeApi(input.accessToken);
    const calendarUrl = resolveCalendarUrl(input.calendarId);
    const uid = input.providerEventId;
    const href = eventResourceHref(calendarUrl, uid);
    const ics = applyInvitationIntent(
      serializeAppleEventCreate({
        providerEventId: uid,
        content: input.content,
        schedule: input.schedule,
        recurrence: input.recurrence,
        busy: true,
        attendees: input.attendees,
      }),
      input.invitation,
      input.attendees,
    );

    try {
      const response = await api.put(href, ics, { ifNoneMatch: "*" });
      if (response.status === 412) {
        const existing = await this.#loadResource(api, href);
        if (!existing) {
          throw new ProviderWriteError(
            "permanentProviderError",
            "Apple reported a duplicate event that could not be read back",
          );
        }
        return toWriteResult(uid, existing.etag, href);
      }
      assertWriteStatus(response);
      const etag = await resolveEtag(api, href, response);
      return toWriteResult(uid, etag, href);
    } catch (error) {
      if (error instanceof ProviderWriteError) throw error;
      throw classifyWriteError(error);
    }
  }

  async patchEvent(input: ProviderPatchInput): Promise<ProviderWriteResult> {
    const api = this.#makeApi(input.accessToken);
    const calendarUrl = resolveCalendarUrl(input.calendarId);
    const parsedInstance = parseAppleInstanceId(input.providerEventId);

    if (input.recurrence.kind === "instance" || parsedInstance) {
      return this.#patchInstance(api, calendarUrl, input, parsedInstance);
    }

    const href = eventResourceHref(calendarUrl, input.providerEventId);
    const current = await this.#loadResource(api, href);
    if (!current) {
      throw new ProviderWriteError(
        "permanentProviderError",
        "Apple event to patch was not found",
      );
    }

    const reads = this.#normalizeResource(current);
    const master = reads.find(
      (read) => read.kind === "event" && read.recurrence.kind !== "instance",
    );
    if (!master || master.kind !== "event") {
      throw new ProviderWriteError(
        "permanentProviderError",
        "Apple event resource had no patchable master",
      );
    }

    const delta = computePatchDelta(master, input);
    const ics = applyInvitationIntent(
      serializeAppleEventPatch({
        providerEventId: input.providerEventId,
        existingIcs: current.ics,
        patchFields: delta.patchFields,
        scheduleChanged: delta.scheduleChanged,
        attendeesChanged: delta.attendeesChanged,
        content: input.content,
        schedule: input.schedule,
        recurrence: input.recurrence,
        busy: master.busy,
        attendees: input.attendees,
      }),
      input.invitation,
      input.attendees ?? input.content.attendees,
    );

    try {
      const response = await api.put(href, ics, {
        ifMatch: input.expectedVersion ?? undefined,
      });
      assertWriteStatus(response);
      const etag = await resolveEtag(api, href, response);
      return toWriteResult(input.providerEventId, etag, href);
    } catch (error) {
      if (error instanceof ProviderWriteError) throw error;
      throw classifyWriteError(error);
    }
  }

  async deleteEvent(input: ProviderDeleteInput): Promise<void> {
    const api = this.#makeApi(input.accessToken);
    const calendarUrl = resolveCalendarUrl(input.calendarId);
    const parsedInstance = parseAppleInstanceId(input.providerEventId);

    if (parsedInstance) {
      await this.#deleteInstance(api, calendarUrl, input, parsedInstance);
      return;
    }

    const href = eventResourceHref(calendarUrl, input.providerEventId);
    try {
      const response = await api.delete(
        href,
        input.expectedVersion ?? undefined,
      );
      if (response.status === 404) return;
      assertWriteStatus(response);
    } catch (error) {
      if (responseStatus(error) === 404) return;
      if (error instanceof ProviderWriteError) throw error;
      throw classifyWriteError(error);
    }
  }

  async fetchEvent(
    input: ProviderFetchInput,
  ): Promise<ProviderEventRead | null> {
    const api = this.#makeApi(input.accessToken);
    const calendarUrl = resolveCalendarUrl(input.calendarId);
    const parsedInstance = parseAppleInstanceId(input.providerEventId);

    if (parsedInstance) {
      return this.fetchInstanceAt({
        accessToken: input.accessToken,
        calendarId: input.calendarId,
        seriesProviderEventId: parsedInstance.seriesUid,
        originalStartAt: parsedInstance.originalStartAt,
        scheduleKind: parsedInstance.scheduleKind,
      });
    }

    const href = eventResourceHref(calendarUrl, input.providerEventId);
    const resource = await this.#loadResource(api, href);
    if (!resource) return null;

    const reads = this.#normalizeResource(resource);
    const master = reads.find(
      (read) =>
        read.kind === "event" && read.providerEventId === input.providerEventId,
    );
    return master ?? reads.find((read) => read.kind === "event") ?? null;
  }

  async fetchInstanceAt(
    input: ProviderInstanceFetchInput,
  ): Promise<ProviderEventRead | null> {
    const api = this.#makeApi(input.accessToken);
    const calendarUrl = resolveCalendarUrl(input.calendarId);
    const href = eventResourceHref(calendarUrl, input.seriesProviderEventId);
    const resource = await this.#loadResource(api, href);
    if (!resource) return null;

    const reads = this.#normalizeResource(resource);
    const recurrenceId = input.originalStartAt;
    const instance = reads.find(
      (read) =>
        read.kind === "event" &&
        read.recurrence.kind === "instance" &&
        read.recurrence.recurrenceId === recurrenceId,
    );
    if (instance) return instance;

    const master = reads.find(
      (read) =>
        read.kind === "event" &&
        read.recurrence.kind === "seriesMaster" &&
        read.providerEventId === input.seriesProviderEventId,
    );
    if (!master || master.kind !== "event") return null;

    return synthesizeInstanceFromMaster(master, input, resource.etag);
  }

  async #patchInstance(
    api: AppleEventWriterApi,
    calendarUrl: string,
    input: ProviderPatchInput,
    parsedInstance: ParsedAppleInstanceId | null,
  ): Promise<ProviderWriteResult> {
    const instanceId =
      parsedInstance ?? parseAppleInstanceId(input.providerEventId);
    if (!instanceId) {
      throw new ProviderWriteError(
        "permanentProviderError",
        "Apple instance patch could not resolve the series identity",
      );
    }

    const href = eventResourceHref(calendarUrl, instanceId.seriesUid);
    const current = await this.#loadResource(api, href);
    if (!current) {
      throw new ProviderWriteError(
        "permanentProviderError",
        "Apple series master for the instance was not found",
      );
    }

    const reads = this.#normalizeResource(current);
    const existingInstance = reads.find(
      (read) =>
        read.kind === "event" && read.providerEventId === input.providerEventId,
    );
    const master = reads.find(
      (read) =>
        read.kind === "event" && read.recurrence.kind === "seriesMaster",
    );
    const baseline =
      existingInstance?.kind === "event"
        ? existingInstance
        : master?.kind === "event"
          ? master
          : null;
    if (!baseline) {
      throw new ProviderWriteError(
        "permanentProviderError",
        "Apple instance patch had no baseline event",
      );
    }

    const delta = computePatchDelta(baseline, input);
    const ics = applyInvitationIntent(
      serializeAppleEventInstance({
        providerEventId: input.providerEventId,
        existingIcs: current.ics,
        instanceRecurrenceId: instanceId.originalStartAt,
        scheduleChanged: delta.scheduleChanged,
        attendeesChanged: delta.attendeesChanged,
        content: input.content,
        schedule: input.schedule,
        recurrence: { kind: "instance" },
        busy: baseline.busy,
        attendees: input.attendees,
      }),
      input.invitation,
      input.attendees ?? input.content.attendees,
    );

    try {
      const response = await api.put(href, ics, {
        ifMatch: input.expectedVersion ?? undefined,
      });
      assertWriteStatus(response);
      const etag = await resolveEtag(api, href, response);
      return toWriteResult(input.providerEventId, etag, href);
    } catch (error) {
      if (error instanceof ProviderWriteError) throw error;
      throw classifyWriteError(error);
    }
  }

  async #deleteInstance(
    api: AppleEventWriterApi,
    calendarUrl: string,
    input: ProviderDeleteInput,
    parsedInstance: ParsedAppleInstanceId,
  ): Promise<void> {
    const href = eventResourceHref(calendarUrl, parsedInstance.seriesUid);
    const current = await this.#loadResource(api, href);
    if (!current) return;

    const ics = appendExdateToMaster(
      current.ics,
      parsedInstance.originalStartAt,
      parsedInstance.scheduleKind,
    );

    try {
      const response = await api.put(href, ics, {
        ifMatch: input.expectedVersion ?? undefined,
      });
      if (response.status === 404) return;
      assertWriteStatus(response);
    } catch (error) {
      if (responseStatus(error) === 404) return;
      if (error instanceof ProviderWriteError) throw error;
      throw classifyWriteError(error);
    }
  }

  async #loadResource(
    api: AppleEventWriterApi,
    href: string,
  ): Promise<AppleEventResourceRef | null> {
    try {
      const response = await api.get(href);
      if (response.status === 404) return null;
      assertWriteStatus(response);
      const etag = headerEtag(response) ?? (await fetchEtag(api, href));
      if (!etag) {
        throw new ProviderWriteError(
          "permanentProviderError",
          "Apple returned an event without an etag",
        );
      }
      return { href, etag, ics: response.body };
    } catch (error) {
      if (responseStatus(error) === 404) return null;
      if (error instanceof ProviderWriteError) throw error;
      throw classifyWriteError(error);
    }
  }

  #normalizeResource(resource: AppleEventResourceRef): ProviderEventRead[] {
    try {
      return normalizeAppleEventResource({
        ics: resource.ics,
        href: resource.href,
        etag: resource.etag,
        connectionTimeZone: this.#connectionTimeZone,
      });
    } catch (error) {
      if (error instanceof ProviderEventError) {
        throw new ProviderWriteError("permanentProviderError", error.message, {
          cause: redactedCause(error),
        });
      }
      throw error;
    }
  }
}

export function createDefaultAppleEventWriterApi(
  accessToken: string,
  makeClient: (username: string, password: string) => CaldavClient = (
    username,
    password,
  ) => createCaldavClient({ username, password }),
  username = "user@icloud.com",
): AppleEventWriterApi {
  const client = makeClient(username, accessToken);
  return new CaldavAppleEventWriterApi(client);
}

class CaldavAppleEventWriterApi implements AppleEventWriterApi {
  constructor(private readonly client: CaldavClient) {}

  put(
    url: string,
    ics: string,
    options?: { ifMatch?: string; ifNoneMatch?: string },
  ): Promise<CaldavResponse> {
    return this.client.put(url, ics, options);
  }

  get(url: string): Promise<CaldavResponse> {
    return this.client.get(url);
  }

  delete(url: string, ifMatch?: string): Promise<CaldavResponse> {
    return this.client.delete(url, ifMatch);
  }

  propfind(url: string, props: readonly string[]): Promise<CaldavResponse> {
    return this.client.propfind(url, [...props], 0);
  }
}

export function eventResourceHref(calendarUrl: string, uid: string): string {
  const base = calendarUrl.endsWith("/") ? calendarUrl : `${calendarUrl}/`;
  return `${base}${uid}.ics`;
}

function resolveCalendarUrl(calendarId: string): string {
  if (calendarId.startsWith("http://") || calendarId.startsWith("https://")) {
    return calendarId.endsWith("/") ? calendarId : `${calendarId}/`;
  }
  const path = calendarId.startsWith("/") ? calendarId : `/${calendarId}`;
  const normalized = path.endsWith("/") ? path : `${path}/`;
  return new URL(normalized, CALDAV_ORIGIN).href;
}

function toWriteResult(
  providerEventId: string,
  providerVersion: string,
  resourceHref: string,
): ProviderWriteResult {
  return {
    providerEventId,
    providerVersion,
    icalUid: providerEventId,
    resourceHref,
  };
}

function headerEtag(response: CaldavResponse): string | null {
  return response.headers["etag"] ?? null;
}

async function resolveEtag(
  api: AppleEventWriterApi,
  href: string,
  response: CaldavResponse,
): Promise<string> {
  const fromHeader = headerEtag(response);
  if (fromHeader) return fromHeader;
  const fetched = await fetchEtag(api, href);
  if (!fetched) {
    throw new ProviderWriteError(
      "permanentProviderError",
      "Apple write succeeded without an etag",
    );
  }
  return fetched;
}

async function fetchEtag(
  api: AppleEventWriterApi,
  href: string,
): Promise<string | null> {
  const response = await api.propfind(href, ["getetag"]);
  assertWriteStatus(response);
  for (const item of response.multistatus?.responses ?? []) {
    for (const propstat of item.propstats) {
      if (propstat.status < 200 || propstat.status >= 300) continue;
      const etag = propstat.props["getetag"];
      if (typeof etag === "string" && etag.length > 0) return etag;
    }
  }
  return null;
}

function assertWriteStatus(response: CaldavResponse): void {
  if (response.status === 401) {
    throw new ProviderWriteError(
      "authorizationRevoked",
      "Apple rejected the credentials",
    );
  }
  if (response.status === 403) {
    throw new ProviderWriteError(
      "readOnlyCalendar",
      "The calendar cannot be written",
    );
  }
  if (response.status === 412) {
    throw new ProviderWriteError(
      "versionConflict",
      "The event was modified since the expected version",
    );
  }
  if (response.status === 429 || response.status === 503) {
    throw new ProviderWriteError(
      "transient",
      "Apple CalDAV throttled the write",
    );
  }
  if (response.status === 507) {
    throw new ProviderWriteError(
      "permanentProviderError",
      "Apple rejected the write with insufficient storage",
    );
  }
  if (response.status < 200 || response.status >= 300) {
    throw new ProviderWriteError(
      "permanentProviderError",
      `Apple CalDAV write failed (${response.status})`,
    );
  }
}

function classifyWriteError(error: unknown): ProviderWriteError {
  if (error instanceof ProviderWriteError) return error;
  const cause = redactedCause(error);
  const status = responseStatus(error);

  if (status === 412) {
    return new ProviderWriteError(
      "versionConflict",
      "The event was modified since the expected version",
      { cause },
    );
  }
  if (status === 401) {
    return new ProviderWriteError(
      "authorizationRevoked",
      "Apple rejected the credentials",
      { cause },
    );
  }
  if (status === 403) {
    return new ProviderWriteError(
      "readOnlyCalendar",
      "The calendar cannot be written",
      { cause },
    );
  }
  if (status === 507) {
    return new ProviderWriteError(
      "permanentProviderError",
      "Apple rejected the write with insufficient storage",
      { cause },
    );
  }
  if (status === undefined || status === 429 || status >= 500) {
    return new ProviderWriteError("transient", "The write failed transiently", {
      cause,
    });
  }
  return new ProviderWriteError(
    "permanentProviderError",
    "Apple rejected the write",
    { cause },
  );
}

function responseStatus(error: unknown): number | undefined {
  return (error as { status?: number })?.status;
}

function computePatchDelta(
  current: ProviderEvent,
  input: ProviderPatchInput,
): {
  patchFields: AppleEventPatchField[];
  scheduleChanged: boolean;
  attendeesChanged: boolean;
} {
  const patchFields = new Set<AppleEventPatchField>();
  const content = input.content;

  if (current.content.title !== content.title) patchFields.add("title");
  if (current.content.description !== content.description) {
    patchFields.add("description");
  }
  if ((current.content.location ?? "") !== (content.location ?? "")) {
    patchFields.add("location");
  }
  if (!organizersEqual(current.content.organizer, content.organizer)) {
    patchFields.add("organizer");
  }
  if (!conferencesEqual(current.content.conference, content.conference)) {
    patchFields.add("conference");
  }
  if (!schedulesEqual(current.schedule, input.schedule)) {
    patchFields.add("schedule");
  }
  if (!recurrencesEqual(current.recurrence, input.recurrence)) {
    patchFields.add("recurrence");
  }

  const attendees = input.attendees ?? content.attendees;
  const attendeesChanged = !attendeesEqual(
    current.content.attendees,
    attendees,
  );
  if (attendeesChanged) patchFields.add("attendees");

  return {
    patchFields: [...patchFields],
    scheduleChanged: patchFields.has("schedule"),
    attendeesChanged,
  };
}

function organizersEqual(
  left: SyncEventContent["organizer"],
  right: SyncEventContent["organizer"],
): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.email === right.email && left.displayName === right.displayName;
}

function conferencesEqual(
  left: SyncEventContent["conference"],
  right: SyncEventContent["conference"],
): boolean {
  return (left?.url ?? null) === (right?.url ?? null);
}

function schedulesEqual(left: EventSchedule, right: EventSchedule): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function recurrencesEqual(
  current: ProviderEvent["recurrence"],
  write: ProviderWriteRecurrence,
): boolean {
  if (write.kind === "instance") return false;
  if (write.kind === "single") {
    return current.kind === "single";
  }
  if (current.kind !== "seriesMaster") return true;
  return (
    JSON.stringify([...current.rules].sort()) ===
    JSON.stringify([...write.rules].sort())
  );
}

function attendeesEqual(
  left: readonly Attendee[],
  right: readonly Attendee[],
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]!;
    const b = right[index]!;
    if (
      a.email !== b.email ||
      a.displayName !== b.displayName ||
      a.responseStatus !== b.responseStatus
    ) {
      return false;
    }
  }
  return true;
}

function applyInvitationIntent(
  ics: string,
  invitation: InvitationIntent,
  attendees: readonly Attendee[] | undefined,
): string {
  if (!attendees || attendees.length === 0) return ics;
  const component = new ICAL.Component(ICAL.parse(ics));
  for (const vevent of component.getAllSubcomponents("vevent")) {
    for (const property of vevent.getAllProperties("attendee")) {
      if (invitation === "none") {
        property.setParameter("schedule-agent", "CLIENT");
      } else {
        property.setParameter("schedule-agent", "SERVER");
      }
    }
  }
  return component.toString();
}

export function appendExdateToMaster(
  existingIcs: string,
  originalStartAt: string,
  scheduleKind: "timed" | "allDay",
): string {
  const calendar = new ICAL.Component(ICAL.parse(existingIcs));
  const master = calendar
    .getAllSubcomponents("vevent")
    .find((vevent) => !vevent.hasProperty("recurrence-id"));
  if (!master) {
    throw new Error("ICS resource had no master VEVENT");
  }

  const exdate = exdateLine(originalStartAt, scheduleKind);
  const existing = master
    .getAllProperties("exdate")
    .some((property) => property.toICALString() === exdate);
  if (!existing) {
    master.addProperty(ICAL.Property.fromString(exdate));
  }

  const recurrenceId = recurrenceIdTime(originalStartAt, scheduleKind);
  for (const vevent of calendar.getAllSubcomponents("vevent")) {
    const property = vevent.getFirstProperty("recurrence-id");
    if (!property) continue;
    const value = property.getFirstValue() as ICAL.Time;
    if (recurrenceTimesEqual(value, recurrenceId)) {
      calendar.removeSubcomponent(vevent);
    }
  }

  return calendar.toString();
}

function exdateLine(
  originalStartAt: string,
  scheduleKind: "timed" | "allDay",
): string {
  if (scheduleKind === "allDay") {
    const dateOnly = dayjs.utc(originalStartAt).format(DATE_ONLY);
    return `EXDATE;VALUE=DATE:${dateOnly.replaceAll("-", "")}`;
  }
  return `EXDATE:${dayjs.utc(originalStartAt).format(RFC5545)}`;
}

function recurrenceIdTime(
  originalStartAt: string,
  scheduleKind: "timed" | "allDay",
): ICAL.Time {
  if (scheduleKind === "allDay") {
    const time = ICAL.Time.fromDateString(
      dayjs.utc(originalStartAt).format(DATE_ONLY),
    );
    time.isDate = true;
    return time;
  }
  return ICAL.Time.fromJSDate(new Date(originalStartAt), true);
}

function recurrenceTimesEqual(a: ICAL.Time, b: ICAL.Time): boolean {
  if (a.isDate !== b.isDate) return false;
  if (a.isDate) return a.toICALString() === b.toICALString();
  return a.toJSDate().getTime() === b.toJSDate().getTime();
}

function synthesizeInstanceFromMaster(
  master: ProviderEvent,
  input: ProviderInstanceFetchInput,
  etag: string,
): ProviderEventRead | null {
  if (master.recurrence.kind !== "seriesMaster") return null;
  const providerEventId = appleInstanceEventId(
    input.seriesProviderEventId,
    input.originalStartAt,
    input.scheduleKind,
  );
  return {
    kind: "event",
    providerEventId,
    providerVersion: etag,
    providerUpdatedAt: master.providerUpdatedAt,
    content: master.content,
    schedule: master.schedule,
    busy: master.busy,
    icalUid: master.icalUid,
    recurrence: {
      kind: "instance",
      seriesProviderId: input.seriesProviderEventId,
      recurrenceId: input.originalStartAt,
    },
  };
}
