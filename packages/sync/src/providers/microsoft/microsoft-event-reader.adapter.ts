import { Logger } from "@core/logger/winston.logger";
import dayjs from "@core/util/date/dayjs";
import {
  isMicrosoftTransient,
  microsoftErrorCode,
  microsoftFailureCause,
  microsoftStatus,
} from "@sync/providers/microsoft/microsoft-error";
import {
  type GraphEvent,
  normalizeMicrosoftEvent,
} from "@sync/providers/microsoft/microsoft-event.normalizer";
import { microsoftGraphRequest } from "@sync/providers/microsoft/microsoft-graph-request";
import {
  MICROSOFT_EVENT_PAGE_SIZE,
  MICROSOFT_EVENT_SELECT,
  MICROSOFT_GRAPH_BASE_URL,
} from "@sync/providers/microsoft/microsoft-http.constants";
import { ProviderEventError } from "@sync/providers/provider-event.port";
import {
  type EventWindow,
  type ProviderEventPage,
  ProviderEventReadError,
  type ProviderEventReader,
  type ProviderEventReadInput,
} from "@sync/providers/provider-event-reader.port";

export interface GraphEventDeltaItem extends GraphEvent {
  readonly ["@removed"]?: { readonly reason?: string };
}

export interface MicrosoftEventListPage {
  readonly items: readonly GraphEventDeltaItem[];
  readonly nextLink: string | null;
  readonly deltaLink: string | null;
}

export interface MicrosoftEventListApi {
  listPage(params: {
    calendarId: string;
    window?: EventWindow | null;
    deltaLink?: string;
    pageLink?: string;
    strategy?: MicrosoftEventListStrategy;
  }): Promise<MicrosoftEventListPage>;
}

export type MicrosoftEventListApiFactory = (
  accessToken: string,
) => MicrosoftEventListApi;

export type MicrosoftEventListStrategy = "events" | "calendarView";

const logger = Logger("sync:microsoft-event-reader");

const defaultApiFactory: MicrosoftEventListApiFactory = (accessToken) =>
  new FetchMicrosoftEventListApi(accessToken);

// Production Graph v1.0 supports unbounded event snapshots, not unbounded
// event delta. Full reads hydrate masters' exceptions/cancellations; refreshes
// use staged snapshots so deletions outside the interactive window are seen.
export class MicrosoftEventReaderAdapter implements ProviderEventReader {
  readonly supportsFullHistory = true;
  readonly fullSnapshotOnly = true;
  #makeApi: MicrosoftEventListApiFactory;
  #log: { warn: (message: string) => void };

  constructor(
    makeApi: MicrosoftEventListApiFactory = defaultApiFactory,
    log?: { warn: (message: string) => void },
  ) {
    this.#makeApi = makeApi;
    this.#log = log ?? logger;
  }

  async listEventPage(
    input: ProviderEventReadInput,
  ): Promise<ProviderEventPage> {
    const api = this.#makeApi(input.accessToken);
    const page = await this.#listPage(api, {
      calendarId: input.calendarId,
      window: input.window ?? null,
      deltaLink: input.cursor ?? undefined,
      pageLink: input.pageToken ?? undefined,
      strategy: resolveListStrategy(input),
    });

    const events = [];
    let skipped = 0;
    for (const item of page.items) {
      if (item["@removed"]) {
        if (!item.id) {
          skipped++;
          this.#log.warn(
            "Skipped unusable Microsoft removal row (missingIdentity)",
          );
          continue;
        }
        events.push({
          kind: "cancellation" as const,
          providerEventId: item.id,
          providerVersion: "",
          series: null,
        });
        continue;
      }

      if (item.type === "occurrence") {
        skipped++;
        this.#log.warn(
          `Skipped Microsoft occurrence row ${item.id ?? "(no id)"} (unmappableContent)`,
        );
        continue;
      }

      try {
        events.push(
          normalizeMicrosoftEvent(item, input.colorLabels ?? new Map()),
        );
      } catch (error) {
        if (error instanceof ProviderEventError) {
          skipped++;
          this.#log.warn(
            `Skipped unusable Microsoft event ${item.id ?? "(no id)"} (${error.reason})`,
          );
          continue;
        }
        throw error;
      }
    }

    return {
      events,
      skipped,
      nextPageToken: page.nextLink,
      nextSyncToken:
        page.deltaLink ??
        (!input.window && !page.nextLink ? "full-snapshot:v1" : null),
    };
  }

  async #listPage(
    api: MicrosoftEventListApi,
    params: Parameters<MicrosoftEventListApi["listPage"]>[0],
  ): Promise<MicrosoftEventListPage> {
    try {
      return await api.listPage(params);
    } catch (error) {
      throw new ProviderEventReadError(
        classifyReadError(error),
        "Microsoft rejected the events read",
        { cause: microsoftFailureCause(error) },
      );
    }
  }
}

function resolveListStrategy(
  input: ProviderEventReadInput,
): MicrosoftEventListStrategy {
  if (input.window?.timeMin && input.window.timeMax) return "calendarView";
  return "events";
}

function classifyReadError(
  error: unknown,
): "cursorExpired" | "authExpired" | "transient" | "readFailed" {
  const status = microsoftStatus(error);
  const code = microsoftErrorCode(error);
  if (status === 410 || code === "syncStateNotFound") return "cursorExpired";
  if (status === 401) return "authExpired";
  if (status === 429 || isMicrosoftTransient(error, status)) return "transient";
  if (status !== undefined && status >= 400 && status < 500) {
    return "readFailed";
  }
  return "transient";
}

class FetchMicrosoftEventListApi implements MicrosoftEventListApi {
  #accessToken: string;

  constructor(accessToken: string) {
    this.#accessToken = accessToken;
  }

  async listPage(
    params: Parameters<MicrosoftEventListApi["listPage"]>[0],
  ): Promise<MicrosoftEventListPage> {
    const url = resolveRequestUrl(params);
    const data = await microsoftGraphRequest<{
      value?: GraphEventDeltaItem[];
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    }>({
      accessToken: this.#accessToken,
      url,
      headers: {
        Prefer: `odata.maxpagesize=${params.strategy === "events" ? 25 : MICROSOFT_EVENT_PAGE_SIZE}, outlook.timezone="UTC"`,
      },
      fallbackError: "microsoft_event_read_failed",
    });
    if (!Array.isArray(data.value))
      throw new Error("Microsoft event list has no collection");

    const items: GraphEventDeltaItem[] = [];
    for (const item of data.value ?? []) {
      if (params.strategy !== "events" || item.type !== "seriesMaster") {
        items.push(item);
        continue;
      }
      const master = await this.#getEvent(item.id, true, params.calendarId);
      items.push(master);
      const normalized = normalizeMicrosoftEvent(master);
      if (normalized.kind !== "event") continue;
      if (
        !Array.isArray(master.exceptionOccurrences) ||
        !Array.isArray(master.cancelledOccurrences)
      )
        throw new Error("Microsoft series expansion is incomplete");
      let exceptions = master.exceptionOccurrences ?? [];
      let next = master["exceptionOccurrences@odata.nextLink"];
      const seenPages = new Set<string>();
      for (;;) {
        for (const exception of exceptions) {
          if (!exception.id)
            throw new Error("Microsoft series exception has no identity");
          const full =
            exception["@odata.etag"] &&
            exception.originalStart &&
            exception.start &&
            exception.end
              ? exception
              : await this.#getEvent(exception.id, false, params.calendarId);
          items.push({ ...full, type: "exception", seriesMasterId: master.id });
        }
        if (!next) break;
        if (seenPages.has(next))
          throw new Error("Microsoft exception pagination did not advance");
        seenPages.add(next);
        const page = await this.#request<{
          value?: GraphEvent[];
          "@odata.nextLink"?: string;
        }>(next);
        if (!Array.isArray(page.value))
          throw new Error("Microsoft exception page has no collection");
        exceptions = page.value;
        next = page["@odata.nextLink"];
      }
      for (const occurrenceId of master.cancelledOccurrences ?? []) {
        const date = /\.(\d{4}-\d{2}-\d{2})$/.exec(occurrenceId)?.[1];
        if (!date)
          throw new Error(
            "Microsoft cancelled occurrence has no original date",
          );
        const originalStart =
          normalized.schedule.kind === "allDay"
            ? `${date}T00:00:00.000Z`
            : dayjs
                .tz(
                  `${date} ${dayjs(normalized.schedule.start).tz(normalized.schedule.timeZone).format("HH:mm:ss")}`,
                  normalized.schedule.timeZone,
                )
                .toISOString();
        items.push({
          id: occurrenceId,
          isCancelled: true,
          seriesMasterId: master.id,
          originalStart,
        });
      }
    }
    return {
      items,
      nextLink: data["@odata.nextLink"] ?? null,
      deltaLink: data["@odata.deltaLink"] ?? null,
    };
  }

  async #getEvent(
    id: string | undefined,
    expand: boolean,
    calendarId: string,
  ): Promise<GraphEvent> {
    if (!id) throw new Error("Microsoft event has no identity");
    const query = new URLSearchParams({
      $select: `${MICROSOFT_EVENT_SELECT}${expand ? ",cancelledOccurrences,exceptionOccurrences" : ""}`,
    });
    if (expand) query.set("$expand", "exceptionOccurrences");
    return this.#request<GraphEvent>(
      `${MICROSOFT_GRAPH_BASE_URL}/me/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}?${query}`,
    );
  }

  async #request<T>(url: string): Promise<T> {
    if (new URL(url).origin !== new URL(MICROSOFT_GRAPH_BASE_URL).origin)
      throw new Error("Microsoft pagination left the configured API origin");
    return microsoftGraphRequest<T>({
      accessToken: this.#accessToken,
      url,
      headers: { Prefer: 'outlook.timezone="UTC"' },
      fallbackError: "microsoft_event_snapshot_failed",
    });
  }
}

function resolveRequestUrl(
  params: Parameters<MicrosoftEventListApi["listPage"]>[0],
): string {
  if (params.pageLink) {
    if (
      new URL(params.pageLink).origin !==
      new URL(MICROSOFT_GRAPH_BASE_URL).origin
    )
      throw new Error("Microsoft pagination left the configured API origin");
    return params.pageLink;
  }

  const calendarId = encodeURIComponent(params.calendarId);
  if (params.strategy === "calendarView") {
    const window = requireWindow(params.window);
    const query = new URLSearchParams({
      startDateTime: window.timeMin,
      endDateTime: window.timeMax,
    });
    return `${MICROSOFT_GRAPH_BASE_URL}/me/calendars/${calendarId}/calendarView?${query}`;
  }

  const query = new URLSearchParams({ $select: MICROSOFT_EVENT_SELECT });
  return `${MICROSOFT_GRAPH_BASE_URL}/me/calendars/${calendarId}/events?${query}`;
}

function requireWindow(window: EventWindow | null | undefined): EventWindow {
  if (!window?.timeMin || !window.timeMax) {
    throw new Error("calendarView requires a bounded window");
  }
  return window;
}
