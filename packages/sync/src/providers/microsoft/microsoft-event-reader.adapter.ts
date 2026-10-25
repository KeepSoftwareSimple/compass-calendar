import { Logger } from "@core/logger/winston.logger";
import { syncHorizon } from "@sync/domain/horizon";
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

export interface MicrosoftExceptionInstancesParams {
  readonly calendarId: string;
  readonly seriesMasterId: string;
  readonly startDateTime: string;
  readonly endDateTime: string;
}

export interface MicrosoftEventListApi {
  listPage(params: {
    calendarId: string;
    window?: EventWindow | null;
    deltaLink?: string;
    pageLink?: string;
    strategy?: MicrosoftEventListStrategy;
  }): Promise<MicrosoftEventListPage>;
  listExceptionInstances(
    params: MicrosoftExceptionInstancesParams,
  ): Promise<readonly GraphEventDeltaItem[]>;
}

export type MicrosoftEventListApiFactory = (
  accessToken: string,
) => MicrosoftEventListApi;

export type MicrosoftEventListStrategy = "events" | "calendarView";

const logger = Logger("sync:microsoft-event-reader");

const defaultApiFactory: MicrosoftEventListApiFactory = (accessToken) =>
  new FetchMicrosoftEventListApi(accessToken);

// Microsoft Graph implementation of the event-read port. Reads one page of a
// calendar's events through events/delta (masters and exceptions, never
// occurrences) or, when a bounded window needs an end date, calendarView/delta.
// Delta omits edited exceptions on masters, so each series master on the page
// also pulls bounded exception instances from Graph.
export class MicrosoftEventReaderAdapter implements ProviderEventReader {
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
    const seenProviderIds = new Set<string>();
    let skipped = 0;
    const colorLabels = input.colorLabels ?? new Map();
    const normalizeOptions = { graphPreferTimeZone: "UTC" as const };
    const seriesMasterIds = new Set<string>();

    const pushItem = (item: GraphEventDeltaItem) => {
      if (!item.id || seenProviderIds.has(item.id)) return;
      try {
        events.push(
          normalizeMicrosoftEvent(item, colorLabels, normalizeOptions),
        );
        seenProviderIds.add(item.id);
      } catch (error) {
        if (error instanceof ProviderEventError) {
          skipped++;
          this.#log.warn(
            `Skipped unusable Microsoft event ${item.id} (${error.reason})`,
          );
          return;
        }
        throw error;
      }
    };

    for (const item of page.items) {
      if (item["@removed"]) {
        if (!item.id) {
          skipped++;
          this.#log.warn(
            "Skipped unusable Microsoft removal row (missingIdentity)",
          );
          continue;
        }
        if (seenProviderIds.has(item.id)) continue;
        events.push({
          kind: "cancellation" as const,
          providerEventId: item.id,
          providerVersion: "",
          series: null,
        });
        seenProviderIds.add(item.id);
        continue;
      }

      if (item.type === "occurrence") {
        skipped++;
        this.#log.warn(
          `Skipped Microsoft occurrence row ${item.id ?? "(no id)"} (unmappableContent)`,
        );
        continue;
      }

      pushItem(item);
      if (item.type === "seriesMaster" && item.id) {
        seriesMasterIds.add(item.id);
        for (const exception of item.exceptionOccurrences ?? []) {
          if (exception.type === "occurrence") continue;
          pushItem({ ...exception, seriesMasterId: item.id });
        }
      }
    }

    const exceptionWindow = resolveExceptionWindow(input.window);
    for (const seriesMasterId of seriesMasterIds) {
      const exceptions = await api.listExceptionInstances({
        calendarId: input.calendarId,
        seriesMasterId,
        startDateTime: exceptionWindow.timeMin,
        endDateTime: exceptionWindow.timeMax,
      });
      for (const exception of exceptions) {
        if (exception.type === "occurrence") continue;
        pushItem({
          ...exception,
          seriesMasterId: exception.seriesMasterId ?? seriesMasterId,
        });
      }
    }

    return {
      events,
      skipped,
      nextPageToken: page.nextLink,
      nextSyncToken: page.deltaLink,
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
        "Microsoft rejected the events delta read",
        { cause: microsoftFailureCause(error) },
      );
    }
  }
}

function resolveListStrategy(
  input: ProviderEventReadInput,
): MicrosoftEventListStrategy {
  if (input.cursor || input.pageToken) return "events";
  if (input.window?.timeMin && input.window.timeMax) return "calendarView";
  return "events";
}

function resolveExceptionWindow(
  window: EventWindow | null | undefined,
): EventWindow {
  if (window?.timeMin && window.timeMax) return window;
  const horizon = syncHorizon(new Date());
  return {
    timeMin: horizon.start.toISOString(),
    timeMax: horizon.end.toISOString(),
  };
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
        Prefer: `odata.maxpagesize=${MICROSOFT_EVENT_PAGE_SIZE}, outlook.timezone="UTC"`,
      },
      fallbackError: "microsoft_event_delta_failed",
    });

    return {
      items: data.value ?? [],
      nextLink: data["@odata.nextLink"] ?? null,
      deltaLink: data["@odata.deltaLink"] ?? null,
    };
  }

  async listExceptionInstances(
    params: MicrosoftExceptionInstancesParams,
  ): Promise<readonly GraphEventDeltaItem[]> {
    const calendarId = encodeURIComponent(params.calendarId);
    const seriesMasterId = encodeURIComponent(params.seriesMasterId);
    const query = new URLSearchParams({
      startDateTime: params.startDateTime,
      endDateTime: params.endDateTime,
      $select: MICROSOFT_EVENT_SELECT,
    });
    let url: string | null =
      `${MICROSOFT_GRAPH_BASE_URL}/me/calendars/${calendarId}/events/${seriesMasterId}/instances?${query}`;
    const exceptions: GraphEventDeltaItem[] = [];

    type InstancesPage = {
      value?: GraphEventDeltaItem[];
      "@odata.nextLink"?: string;
    };
    while (url) {
      const requestUrl = url;
      const data: InstancesPage = await microsoftGraphRequest<InstancesPage>({
        accessToken: this.#accessToken,
        url: requestUrl,
        headers: {
          Prefer: `odata.maxpagesize=${MICROSOFT_EVENT_PAGE_SIZE}, outlook.timezone="UTC"`,
        },
        fallbackError: "microsoft_event_instances_failed",
      });
      for (const row of data.value ?? []) {
        if (row.type === "exception") exceptions.push(row);
      }
      url = data["@odata.nextLink"] ?? null;
    }

    return exceptions;
  }
}

function resolveRequestUrl(
  params: Parameters<MicrosoftEventListApi["listPage"]>[0],
): string {
  if (params.pageLink) return params.pageLink;
  if (params.deltaLink) return params.deltaLink;

  const calendarId = encodeURIComponent(params.calendarId);
  if (params.strategy === "calendarView") {
    const window = requireWindow(params.window);
    const query = new URLSearchParams({
      startDateTime: window.timeMin,
      endDateTime: window.timeMax,
    });
    return `${MICROSOFT_GRAPH_BASE_URL}/me/calendars/${calendarId}/calendarView/delta?${query}`;
  }

  const query = new URLSearchParams({
    $select: MICROSOFT_EVENT_SELECT,
    startDateTime: resolveStartDateTime(params.window),
  });
  return `${MICROSOFT_GRAPH_BASE_URL}/me/calendars/${calendarId}/events/delta?${query}`;
}

function requireWindow(window: EventWindow | null | undefined): EventWindow {
  if (!window?.timeMin || !window.timeMax) {
    throw new Error("calendarView delta requires a bounded window");
  }
  return window;
}

function resolveStartDateTime(window: EventWindow | null | undefined): string {
  if (window?.timeMin) return window.timeMin;
  return syncHorizon(new Date()).start.toISOString();
}
