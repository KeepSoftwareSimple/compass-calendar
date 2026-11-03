import { Logger } from "@core/logger/winston.logger";
import dayjs from "@core/util/date/dayjs";
import { type AppleCalendarClientFactory } from "@sync/providers/apple/apple-calendar.adapter";
import { normalizeAppleEventResource } from "@sync/providers/apple/apple-event.normalizer";
import {
  type CaldavClient,
  type CaldavResponse,
  createCaldavClient,
  type ParsedMultistatus,
  type ParsedResponse,
} from "@sync/providers/apple/caldav-client";
import {
  ProviderEventError,
  type ProviderEventRead,
} from "@sync/providers/provider-event.port";
import {
  type EventWindow,
  type ProviderEventPage,
  ProviderEventReadError,
  type ProviderEventReader,
  type ProviderEventReadInput,
} from "@sync/providers/provider-event-reader.port";

const logger = Logger("sync:apple-event-reader");

export const MULTIGET_BATCH_SIZE = 50;
export const SYNC_COLLECTION_LIMIT = 100;
const CALDAV_ORIGIN = "https://caldav.icloud.com";

export interface AppleEventResource {
  readonly href: string;
  readonly etag: string;
  readonly ics: string;
}

export interface AppleEventReaderApi {
  calendarQuery(
    calendarUrl: string,
    window: EventWindow | null,
  ): Promise<readonly string[]>;
  calendarMultiget(
    calendarUrl: string,
    hrefs: readonly string[],
  ): Promise<readonly AppleEventResource[]>;
  syncCollection(
    calendarUrl: string,
    syncToken: string,
  ): Promise<AppleSyncCollectionPage>;
  fetchSyncToken(calendarUrl: string): Promise<string | null>;
}

export interface AppleSyncCollectionPage {
  readonly changedHrefs: readonly string[];
  readonly deletedHrefs: readonly string[];
  readonly nextSyncToken: string | null;
  readonly truncated: boolean;
}

export type AppleEventReaderApiFactory = (
  accessToken: string,
) => AppleEventReaderApi;

interface InitialPassState {
  readonly hrefs: readonly string[];
  readonly window: EventWindow | null;
  readonly fetchSyncToken: boolean;
}

export class AppleEventReaderAdapter implements ProviderEventReader {
  readonly supportsFullHistory = true;
  #connectionTimeZone: string;
  #makeApi: AppleEventReaderApiFactory;
  #initialPassState = new Map<string, InitialPassState>();
  #log: { warn: (message: string) => void };

  constructor(
    username: string,
    options: {
      connectionTimeZone?: string;
      makeApi?: AppleEventReaderApiFactory;
      log?: { warn: (message: string) => void };
    } = {},
  ) {
    this.#connectionTimeZone = options.connectionTimeZone ?? "UTC";
    this.#makeApi =
      options.makeApi ??
      ((accessToken) =>
        createDefaultAppleEventReaderApi(username, accessToken));
    this.#log = options.log ?? logger;
  }

  async listEventPage(
    input: ProviderEventReadInput,
  ): Promise<ProviderEventPage> {
    const api = this.#makeApi(input.accessToken);
    const calendarUrl = resolveCalendarUrl(input.calendarId);

    if (input.window) {
      return this.#readInitialPass(api, calendarUrl, input, {
        window: input.window,
        fetchSyncToken: false,
      });
    }

    if (input.cursor) {
      return this.#readIncremental(api, calendarUrl, input);
    }

    return this.#readInitialPass(api, calendarUrl, input, {
      window: null,
      fetchSyncToken: true,
    });
  }

  async #readInitialPass(
    api: AppleEventReaderApi,
    calendarUrl: string,
    input: ProviderEventReadInput,
    pass: { window: EventWindow | null; fetchSyncToken: boolean },
  ): Promise<ProviderEventPage> {
    const stateKey = initialPassKey(input.calendarId, input.accessToken, pass);
    let hrefs = this.#initialPassState.get(stateKey)?.hrefs;
    const offset = parseInitialOffset(input.pageToken);

    if (hrefs === undefined) {
      if (pass.window) {
        hrefs = await this.#queryHrefs(api, calendarUrl, pass.window);
      } else {
        hrefs = await this.#queryHrefs(api, calendarUrl, null);
      }
      this.#initialPassState.set(stateKey, {
        hrefs,
        window: pass.window,
        fetchSyncToken: pass.fetchSyncToken,
      });
    }

    const batch = hrefs.slice(offset, offset + MULTIGET_BATCH_SIZE);
    const resources =
      batch.length > 0 ? await api.calendarMultiget(calendarUrl, batch) : [];
    const normalized = this.#normalizeResources(resources);

    const nextOffset = offset + batch.length;
    const hasMore = nextOffset < hrefs.length;
    if (hasMore) {
      return {
        ...normalized,
        nextPageToken: String(nextOffset),
        nextSyncToken: null,
      };
    }

    this.#initialPassState.delete(stateKey);
    const nextSyncToken = pass.fetchSyncToken
      ? await api.fetchSyncToken(calendarUrl)
      : null;
    return {
      ...normalized,
      nextPageToken: null,
      nextSyncToken,
    };
  }

  async #readIncremental(
    api: AppleEventReaderApi,
    calendarUrl: string,
    input: ProviderEventReadInput,
  ): Promise<ProviderEventPage> {
    const syncToken = input.pageToken ?? input.cursor ?? "";
    const page = await this.#syncCollection(api, calendarUrl, syncToken);

    const changed =
      page.changedHrefs.length > 0
        ? await api.calendarMultiget(calendarUrl, page.changedHrefs)
        : [];
    const normalized = this.#normalizeResources(changed);
    const deletions = page.deletedHrefs.map((href) => ({
      kind: "cancellation" as const,
      providerEventId: href,
      providerVersion: "",
      series: null,
    }));

    return {
      events: [...normalized.events, ...deletions],
      skipped: normalized.skipped,
      nextPageToken: page.truncated ? (page.nextSyncToken ?? syncToken) : null,
      nextSyncToken: page.truncated ? null : page.nextSyncToken,
    };
  }

  async #queryHrefs(
    api: AppleEventReaderApi,
    calendarUrl: string,
    window: EventWindow | null,
  ): Promise<readonly string[]> {
    try {
      return await api.calendarQuery(calendarUrl, window);
    } catch (error) {
      throw classifyReadError(error, "CalDAV calendar-query failed");
    }
  }

  async #syncCollection(
    api: AppleEventReaderApi,
    calendarUrl: string,
    syncToken: string,
  ): Promise<AppleSyncCollectionPage> {
    try {
      return await api.syncCollection(calendarUrl, syncToken);
    } catch (error) {
      throw classifyReadError(error, "CalDAV sync-collection failed");
    }
  }

  #normalizeResources(
    resources: readonly AppleEventResource[],
  ): Pick<ProviderEventPage, "events" | "skipped"> {
    const events: ProviderEventRead[] = [];
    let skipped = 0;

    for (const resource of resources) {
      try {
        const reads = normalizeAppleEventResource({
          ics: resource.ics,
          href: resource.href,
          etag: resource.etag,
          connectionTimeZone: this.#connectionTimeZone,
        });
        for (const read of reads) {
          if (read.kind === "event") {
            events.push({ ...read, resourceHref: resource.href });
          } else {
            events.push(read);
          }
        }
      } catch (error) {
        if (error instanceof ProviderEventError) {
          skipped += 1;
          this.#log.warn(
            `Skipped unusable Apple event ${resource.href} (${error.reason})`,
          );
          continue;
        }
        throw error;
      }
    }

    return { events, skipped };
  }
}

export function createDefaultAppleEventReaderApi(
  username: string,
  accessToken: string,
  makeClient: AppleCalendarClientFactory = (username, password) =>
    createCaldavClient({ username, password }),
): AppleEventReaderApi {
  const client = makeClient(username, accessToken);
  return new CaldavAppleEventReaderApi(client);
}

class CaldavAppleEventReaderApi implements AppleEventReaderApi {
  constructor(private readonly client: CaldavClient) {}

  async calendarQuery(
    calendarUrl: string,
    window: EventWindow | null,
  ): Promise<readonly string[]> {
    const body = buildCalendarQueryBody(window);
    const response = await this.client.report(calendarUrl, body, 1);
    assertReadStatus(response);
    return extractSuccessfulHrefs(response.multistatus);
  }

  async calendarMultiget(
    calendarUrl: string,
    hrefs: readonly string[],
  ): Promise<readonly AppleEventResource[]> {
    if (hrefs.length === 0) return [];
    const body = buildCalendarMultigetBody(hrefs);
    const response = await this.client.report(calendarUrl, body, 1);
    assertReadStatus(response);
    return extractMultigetResources(response.multistatus, calendarUrl);
  }

  async syncCollection(
    calendarUrl: string,
    syncToken: string,
  ): Promise<AppleSyncCollectionPage> {
    const body = buildSyncCollectionBody(syncToken);
    const response = await this.client.report(calendarUrl, body, 1);
    if (response.status === 507) {
      return parseSyncCollectionTruncation(response);
    }
    assertReadStatus(response);
    return parseSyncCollectionPage(response);
  }

  async fetchSyncToken(calendarUrl: string): Promise<string | null> {
    const response = await this.client.propfind(calendarUrl, ["sync-token"], 0);
    assertReadStatus(response);
    return extractSyncToken(response.multistatus);
  }
}

function buildCalendarQueryBody(window: EventWindow | null): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        ${window ? `<C:time-range start="${toCalDavUtc(window.timeMin)}" end="${toCalDavUtc(window.timeMax)}"/>` : ""}
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;
}

function buildCalendarMultigetBody(hrefs: readonly string[]): string {
  const hrefElements = hrefs
    .map((href) => `<D:href>${escapeXml(href)}</D:href>`)
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<C:calendar-multiget xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  ${hrefElements}
</C:calendar-multiget>`;
}

function buildSyncCollectionBody(syncToken: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<D:sync-collection xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:sync-token>${escapeXml(syncToken)}</D:sync-token>
  <D:sync-level>1</D:sync-level>
  <D:limit>${SYNC_COLLECTION_LIMIT}</D:limit>
  <D:prop>
    <D:getetag/>
  </D:prop>
</D:sync-collection>`;
}

function parseSyncCollectionPage(
  response: CaldavResponse,
): AppleSyncCollectionPage {
  const multistatus = response.multistatus;
  const changedHrefs: string[] = [];
  const deletedHrefs: string[] = [];

  for (const item of multistatus?.responses ?? []) {
    const status = primaryPropstatStatus(item);
    if (status === 404) {
      deletedHrefs.push(normalizeHref(item.href));
      continue;
    }
    if (status >= 200 && status < 300) {
      changedHrefs.push(normalizeHref(item.href));
    }
  }

  return {
    changedHrefs,
    deletedHrefs,
    nextSyncToken: extractSyncToken(multistatus),
    truncated: hasTruncationMarker(response.body, multistatus),
  };
}

function parseSyncCollectionTruncation(
  response: CaldavResponse,
): AppleSyncCollectionPage {
  const page = parseSyncCollectionPage(response);
  return { ...page, truncated: true };
}

function hasTruncationMarker(
  body: string,
  multistatus: ParsedMultistatus | null,
): boolean {
  if (body.includes("number-of-matches-within-limits")) return true;
  for (const response of multistatus?.responses ?? []) {
    for (const propstat of response.propstats) {
      if ("number-of-matches-within-limits" in propstat.props) return true;
    }
  }
  return false;
}

function extractMultigetResources(
  multistatus: ParsedMultistatus | null,
  calendarUrl: string,
): AppleEventResource[] {
  const resources: AppleEventResource[] = [];
  for (const response of multistatus?.responses ?? []) {
    const status = primaryPropstatStatus(response);
    if (status < 200 || status >= 300) continue;
    const props = successfulProps(response);
    const ics = stringProp(props["calendar-data"]);
    const etag = stringProp(props["getetag"]);
    if (!ics || !etag) continue;
    resources.push({
      href: resolveResourceHref(response.href, calendarUrl),
      etag,
      ics,
    });
  }
  return resources;
}

function extractSuccessfulHrefs(
  multistatus: ParsedMultistatus | null,
): string[] {
  const hrefs: string[] = [];
  for (const response of multistatus?.responses ?? []) {
    const status = primaryPropstatStatus(response);
    if (status >= 200 && status < 300) {
      hrefs.push(normalizeHref(response.href));
    }
  }
  return hrefs;
}

function extractSyncToken(
  multistatus: ParsedMultistatus | null,
): string | null {
  for (const response of multistatus?.responses ?? []) {
    const props = successfulProps(response);
    const token = stringProp(props["sync-token"]);
    if (token) return token;
  }
  return null;
}

function assertReadStatus(response: CaldavResponse): void {
  if (response.status === 401) {
    throw new ProviderEventReadError(
      "authExpired",
      "Apple rejected the credentials",
    );
  }
  if (response.status === 403 && hasValidSyncTokenPrecondition(response)) {
    throw new ProviderEventReadError(
      "cursorExpired",
      "Apple sync token is no longer valid",
    );
  }
  if (response.status === 429 || response.status === 503) {
    throw new ProviderEventReadError(
      "transient",
      `Apple CalDAV throttled or unavailable (${response.status})`,
    );
  }
  if (response.status === 507) return;
  if (response.status < 200 || response.status >= 300) {
    throw new ProviderEventReadError(
      "readFailed",
      `Apple CalDAV read failed (${response.status})`,
    );
  }
}

function classifyReadError(
  error: unknown,
  message: string,
): ProviderEventReadError {
  if (error instanceof ProviderEventReadError) return error;
  return new ProviderEventReadError("readFailed", message, { cause: error });
}

function hasValidSyncTokenPrecondition(response: CaldavResponse): boolean {
  const body = response.body.toLowerCase();
  return (
    body.includes("valid-sync-token") ||
    body.includes("valid sync token") ||
    body.includes("sync-token-ok")
  );
}

function successfulProps(response: ParsedResponse): Record<string, unknown> {
  for (const propstat of response.propstats) {
    if (propstat.status >= 200 && propstat.status < 300) {
      return propstat.props;
    }
  }
  return {};
}

function primaryPropstatStatus(response: ParsedResponse): number {
  return response.propstats[0]?.status ?? 0;
}

function stringProp(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function resolveCalendarUrl(calendarId: string): string {
  if (calendarId.startsWith("http://") || calendarId.startsWith("https://")) {
    return calendarId;
  }
  return new URL(calendarId, CALDAV_ORIGIN).href;
}

function resolveResourceHref(href: string, calendarUrl: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  return new URL(href, calendarUrl).href;
}

function normalizeHref(href: string): string {
  return href.startsWith("/") ? href : `/${href}`;
}

function initialPassKey(
  calendarId: string,
  accessToken: string,
  pass: { window: EventWindow | null; fetchSyncToken: boolean },
): string {
  const windowKey = pass.window
    ? `${pass.window.timeMin}:${pass.window.timeMax}`
    : "full";
  return `${calendarId}:${accessToken}:${windowKey}:${pass.fetchSyncToken ? "sync" : "nosync"}`;
}

function parseInitialOffset(pageToken: string | null | undefined): number {
  if (!pageToken) return 0;
  const offset = Number(pageToken);
  if (!Number.isInteger(offset) || offset < 0) {
    throw new ProviderEventReadError(
      "readFailed",
      "Apple initial pass page token is invalid",
    );
  }
  return offset;
}

function toCalDavUtc(iso: string): string {
  return dayjs(iso).utc().format("YYYYMMDD[T]HHmmss[Z]");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
