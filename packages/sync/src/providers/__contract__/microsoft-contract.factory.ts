import { MicrosoftAuthAdapter } from "@sync/providers/microsoft/microsoft-auth.adapter";
import { MicrosoftCalendarAdapter } from "@sync/providers/microsoft/microsoft-calendar.adapter";
import { type GraphEvent } from "@sync/providers/microsoft/microsoft-event.normalizer";
import {
  type GraphEventDeltaItem,
  type MicrosoftEventListApi,
  type MicrosoftEventListPage,
  MicrosoftEventReaderAdapter,
} from "@sync/providers/microsoft/microsoft-event-reader.adapter";
import {
  type MicrosoftEventWriteApi,
  MicrosoftEventWriter,
} from "@sync/providers/microsoft/microsoft-event-writer.adapter";
import {
  type GraphSubscription,
  MicrosoftNotificationAdapter,
  type MicrosoftSubscriptionCreateBody,
  type MicrosoftSubscriptionsApi,
} from "@sync/providers/microsoft/microsoft-notifications.adapter";
import { type ProviderAdapters } from "@sync/providers/provider-adapters";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONTRACT_ROOT = dirname(fileURLToPath(import.meta.url));

interface ReaderCorpusPage {
  readonly items: readonly GraphEventDeltaItem[];
  readonly nextLink?: string | null;
  readonly deltaLink?: string | null;
}

export interface MicrosoftReaderCorpus {
  readonly page1: ReaderCorpusPage;
  readonly page2: ReaderCorpusPage;
  readonly expiredDeltaLink: string;
  readonly masterCategories: Record<string, string>;
}

interface WriterCorpus {
  readonly create: GraphEvent;
  readonly fetch: GraphEvent;
  readonly instance: GraphEvent;
  readonly meetingSettings: {
    readonly defaultOnlineMeetingProvider?: string;
    readonly allowedOnlineMeetingProviders?: readonly string[];
  };
}

interface NotificationsCorpus {
  readonly watch: GraphSubscription;
}

class CorpusSubscriptionsApi implements MicrosoftSubscriptionsApi {
  constructor(private readonly corpus: NotificationsCorpus) {}

  async createSubscription(
    _body: MicrosoftSubscriptionCreateBody,
  ): Promise<GraphSubscription> {
    return this.corpus.watch;
  }

  async deleteSubscription(_subscriptionId: string): Promise<void> {}
}

class CorpusEventListApi implements MicrosoftEventListApi {
  constructor(private readonly corpus: MicrosoftReaderCorpus) {}

  async listPage(
    params: Parameters<MicrosoftEventListApi["listPage"]>[0],
  ): Promise<MicrosoftEventListPage> {
    if (params.deltaLink === this.corpus.expiredDeltaLink) {
      throw httpError(410);
    }
    if (params.pageLink) {
      return normalizePage(this.corpus.page2);
    }
    return normalizePage(this.corpus.page1);
  }

  async listExceptionInstances(): Promise<readonly GraphEventDeltaItem[]> {
    return [];
  }
}

function normalizePage(page: ReaderCorpusPage): MicrosoftEventListPage {
  return {
    items: page.items,
    nextLink: page.nextLink ?? null,
    deltaLink: page.deltaLink ?? null,
  };
}

function httpError(status: number, body?: unknown): Error {
  return Object.assign(new Error(`microsoft error ${status}`), {
    response: { status, data: body },
  });
}

function loadJson<T>(corpusDir: string, name: string): T {
  return JSON.parse(readFileSync(join(corpusDir, `${name}.json`), "utf8")) as T;
}

class CorpusEventWriteApi implements MicrosoftEventWriteApi {
  #etag: string;
  #deleted = new Set<string>();
  #transactionEvents = new Map<string, GraphEvent>();

  constructor(private readonly corpus: WriterCorpus) {
    this.#etag = corpus.create["@odata.etag"] ?? 'W/"graph-v1"';
  }

  async create(
    params: Parameters<MicrosoftEventWriteApi["create"]>[0],
  ): Promise<GraphEvent> {
    const transactionId = params.body.transactionId;
    if (transactionId && this.#transactionEvents.has(transactionId)) {
      return this.#transactionEvents.get(transactionId)!;
    }
    const created = {
      ...this.corpus.create,
      id: transactionId ?? this.corpus.create.id,
      "@odata.etag": this.#etag,
    };
    if (transactionId) this.#transactionEvents.set(transactionId, created);
    return created;
  }

  async patch(
    params: Parameters<MicrosoftEventWriteApi["patch"]>[0],
  ): Promise<GraphEvent> {
    if (params.ifMatch && params.ifMatch !== this.#etag) {
      throw httpError(412);
    }
    this.#etag = 'W/"graph-v2"';
    return {
      ...this.corpus.create,
      id: params.eventId,
      "@odata.etag": this.#etag,
    };
  }

  async delete(
    params: Parameters<MicrosoftEventWriteApi["delete"]>[0],
  ): Promise<void> {
    if (this.#deleted.has(params.eventId)) throw httpError(404);
    this.#deleted.add(params.eventId);
  }

  async get(
    params: Parameters<MicrosoftEventWriteApi["get"]>[0],
  ): Promise<GraphEvent> {
    return {
      ...this.corpus.fetch,
      id: params.eventId,
      "@odata.etag": this.#etag,
    };
  }

  async listInstances(
    params: Parameters<MicrosoftEventWriteApi["listInstances"]>[0],
  ): Promise<readonly GraphEvent[]> {
    if (params.seriesMasterId !== "series-1") return [];
    return [
      {
        ...this.corpus.instance,
        seriesMasterId: params.seriesMasterId,
      },
    ];
  }

  async getCalendarMeetingSettings(): Promise<{
    defaultOnlineMeetingProvider?: string;
    allowedOnlineMeetingProviders?: readonly string[];
  }> {
    return this.corpus.meetingSettings;
  }
}

export function microsoftLiveFactory(_corpusDir: string): ProviderAdapters {
  const clientId = process.env["MICROSOFT_CLIENT_ID"] ?? "";
  const clientSecret = process.env["MICROSOFT_CLIENT_SECRET"] ?? "";
  return {
    auth: new MicrosoftAuthAdapter(clientId, clientSecret),
    calendars: new MicrosoftCalendarAdapter(),
    reader: new MicrosoftEventReaderAdapter(),
    writer: new MicrosoftEventWriter(),
    notifications: new MicrosoftNotificationAdapter(),
  };
}

export function hasMicrosoftLiveCredentials(): boolean {
  return Boolean(
    process.env["MICROSOFT_CLIENT_ID"] &&
      process.env["MICROSOFT_CLIENT_SECRET"] &&
      process.env["SMOKE_MICROSOFT_REFRESH_TOKEN"],
  );
}

/** Replay `fixtures/microsoft/reader.json` through the event reader adapter. */
export function microsoftRecordedReader(
  corpusDir: string,
): MicrosoftEventReaderAdapter {
  const reader = loadJson<MicrosoftReaderCorpus>(corpusDir, "reader");
  return new MicrosoftEventReaderAdapter(() => new CorpusEventListApi(reader), {
    warn: () => {},
  });
}

export function defaultMicrosoftReaderCorpus(): MicrosoftReaderCorpus {
  return loadJson<MicrosoftReaderCorpus>(
    join(CONTRACT_ROOT, "fixtures", "microsoft"),
    "reader",
  );
}

export function microsoftReaderMasterCategories(): Map<string, string> {
  return new Map(
    Object.entries(defaultMicrosoftReaderCorpus().masterCategories),
  );
}

/** Replay `fixtures/microsoft/writer.json` through the event writer adapter. */
export function microsoftRecordedWriter(
  corpusDir: string,
): MicrosoftEventWriter {
  const writer = loadJson<WriterCorpus>(corpusDir, "writer");
  return new MicrosoftEventWriter(() => new CorpusEventWriteApi(writer));
}

/** Replay `fixtures/microsoft/notifications.json` through the notification adapter. */
export function microsoftRecordedNotifications(
  corpusDir: string,
): MicrosoftNotificationAdapter {
  const notifications = loadJson<NotificationsCorpus>(
    corpusDir,
    "notifications",
  );
  return new MicrosoftNotificationAdapter(
    () => new CorpusSubscriptionsApi(notifications),
    () => new Date("2026-01-01T00:00:00Z"),
  );
}
