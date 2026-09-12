import {
  isMicrosoftTransient,
  microsoftErrorCode,
  microsoftFailureCause,
  microsoftStatus,
} from "@sync/providers/microsoft/microsoft-error";
import { microsoftGraphRequest } from "@sync/providers/microsoft/microsoft-graph-request";
import { MICROSOFT_GRAPH_BASE_URL } from "@sync/providers/microsoft/microsoft-http.constants";
import { classifyProviderWatchError } from "@sync/providers/provider-notification-error";
import {
  type NotificationChannel,
  type NotificationParseResult,
  type NotificationRequest,
  type ProviderNotification,
  type ProviderNotificationAdapter,
  ProviderNotificationError,
  type ProviderNotificationLifecycle,
} from "@sync/providers/provider-notifications.port";

export interface GraphSubscription {
  readonly id: string;
  readonly resource: string;
  readonly expirationDateTime: string;
}

export interface MicrosoftSubscriptionCreateBody {
  readonly changeType: string;
  readonly notificationUrl: string;
  readonly lifecycleNotificationUrl: string;
  readonly resource: string;
  readonly expirationDateTime: string;
  readonly clientState: string;
}

export interface MicrosoftSubscriptionsApi {
  createSubscription(
    body: MicrosoftSubscriptionCreateBody,
  ): Promise<GraphSubscription>;
  deleteSubscription(subscriptionId: string): Promise<void>;
}

export type MicrosoftSubscriptionsApiFactory = (
  accessToken: string,
) => MicrosoftSubscriptionsApi;

const DEFAULT_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_TTL_MS = 4230 * 60 * 1000;

const defaultApiFactory: MicrosoftSubscriptionsApiFactory = (accessToken) =>
  new FetchMicrosoftSubscriptionsApi(accessToken);

export class MicrosoftNotificationAdapter
  implements ProviderNotificationAdapter
{
  #makeApi: MicrosoftSubscriptionsApiFactory;
  #now: () => Date;

  constructor(
    makeApi: MicrosoftSubscriptionsApiFactory = defaultApiFactory,
    now: () => Date = () => new Date(),
  ) {
    this.#makeApi = makeApi;
    this.#now = now;
  }

  async watch(input: {
    accessToken: string;
    calendarId?: string;
    channelId: string;
    token: string;
    callbackUrl: string;
    ttlMs?: number;
  }): Promise<NotificationChannel> {
    if (input.calendarId === undefined) {
      throw new ProviderNotificationError(
        "watchUnsupported",
        "Microsoft Graph does not support watching calendar list changes",
      );
    }

    const api = this.#makeApi(input.accessToken);
    const expirationDateTime = this.#expirationIso(input.ttlMs);
    const resource = `/me/calendars/${input.calendarId}/events`;

    let subscription: GraphSubscription;
    try {
      subscription = await api.createSubscription({
        changeType: "created,updated,deleted",
        notificationUrl: input.callbackUrl,
        lifecycleNotificationUrl: input.callbackUrl,
        resource,
        expirationDateTime,
        clientState: input.token,
      });
    } catch (error) {
      throw classifyWatchError(error);
    }

    if (!subscription.id || !subscription.resource) {
      throw new ProviderNotificationError(
        "watchFailed",
        "Microsoft returned a subscription without an id or resource",
      );
    }

    return {
      channelId: subscription.id,
      resourceId: subscription.resource,
      expiresAt: parseExpiration(
        subscription.expirationDateTime,
        expirationDateTime,
      ),
      // Graph only returns a subscription after our endpoint echoed its
      // validationToken, so a created subscription proves the callback route.
      callbackVerified: true,
    };
  }

  async stopChannel(input: {
    accessToken: string;
    channelId: string;
    resourceId: string;
  }): Promise<void> {
    void input.resourceId;
    const api = this.#makeApi(input.accessToken);
    try {
      await api.deleteSubscription(input.channelId);
    } catch (error) {
      const status = microsoftStatus(error);
      if (status === 404) return;
      throw classifyWatchError(error);
    }
  }

  parseNotification(request: NotificationRequest): NotificationParseResult {
    return parseMicrosoftNotification(request);
  }

  #expirationIso(ttlMs?: number): string {
    const ttl = Math.min(ttlMs ?? DEFAULT_TTL_MS, MAX_TTL_MS);
    return new Date(this.#now().getTime() + ttl).toISOString();
  }
}

class FetchMicrosoftSubscriptionsApi implements MicrosoftSubscriptionsApi {
  constructor(private readonly accessToken: string) {}

  async createSubscription(
    body: MicrosoftSubscriptionCreateBody,
  ): Promise<GraphSubscription> {
    return microsoftGraphRequest<GraphSubscription>({
      accessToken: this.accessToken,
      url: `${MICROSOFT_GRAPH_BASE_URL}/subscriptions`,
      method: "POST",
      body,
      fallbackError: "microsoft_subscription_create_failed",
    });
  }

  async deleteSubscription(subscriptionId: string): Promise<void> {
    await microsoftGraphRequest<void>({
      accessToken: this.accessToken,
      url: `${MICROSOFT_GRAPH_BASE_URL}/subscriptions/${encodeURIComponent(subscriptionId)}`,
      method: "DELETE",
      fallbackError: "microsoft_subscription_delete_failed",
      emptyOk: true,
    });
  }
}

interface GraphNotificationItem {
  readonly subscriptionId?: string;
  readonly clientState?: string;
  readonly resource?: string;
  readonly changeType?: string;
  readonly lifecycleEvent?: string;
}

export function parseMicrosoftNotification(
  request: NotificationRequest,
): NotificationParseResult {
  const validationToken = readValidationToken(request.query);
  if (validationToken !== null) {
    return { kind: "validation", body: validationToken };
  }

  const items = readNotificationItems(request.body);
  if (items.length === 0) return null;

  const notifications = items
    .map(mapGraphNotificationItem)
    .filter((item): item is ProviderNotification => item !== null);

  if (notifications.length === 0) return null;
  if (notifications.length === 1) return notifications[0]!;
  return { kind: "batch", notifications };
}

function readValidationToken(query: Record<string, unknown>): string | null {
  const token = query["validationToken"];
  if (typeof token !== "string" || token.length === 0) return null;
  return token;
}

function readNotificationItems(body: unknown): GraphNotificationItem[] {
  if (typeof body !== "object" || body === null) return [];
  const value = (body as { value?: unknown }).value;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is GraphNotificationItem =>
      typeof item === "object" && item !== null,
  );
}

function mapGraphNotificationItem(
  item: GraphNotificationItem,
): ProviderNotification | null {
  const channelId = item.subscriptionId;
  const resourceId = item.resource;
  if (!channelId || !resourceId) return null;

  const lifecycle = mapLifecycleEvent(item.lifecycleEvent);
  return {
    channelId,
    resourceId,
    token: item.clientState ?? null,
    state: "changed",
    ...(lifecycle ? { lifecycle } : {}),
  };
}

function mapLifecycleEvent(
  lifecycleEvent: string | undefined,
): ProviderNotificationLifecycle | undefined {
  if (lifecycleEvent === "reauthorizationRequired") {
    return "reauthorizationRequired";
  }
  if (lifecycleEvent === "subscriptionRemoved") return "subscriptionRemoved";
  if (lifecycleEvent === "missed") return "missed";
  return undefined;
}

function parseExpiration(
  expirationDateTime: string | null | undefined,
  fallbackIso: string,
): Date {
  if (!expirationDateTime) return new Date(fallbackIso);
  const parsed = Date.parse(expirationDateTime);
  return Number.isFinite(parsed) ? new Date(parsed) : new Date(fallbackIso);
}

function classifyWatchError(error: unknown): ProviderNotificationError {
  return classifyProviderWatchError(error, {
    status: microsoftStatus,
    cause: microsoftFailureCause,
    isTransient: isMicrosoftTransient,
    isWatchUnsupported,
    credentialRejectedMessage: "Microsoft rejected the credential",
    watchUnsupportedMessage:
      "Microsoft does not support watching this resource",
    transientUnavailableMessage: "Microsoft watch temporarily unavailable",
    watchFailedMessage: "Microsoft refused to open the channel",
  });
}

function isWatchUnsupported(error: unknown): boolean {
  return (
    microsoftStatus(error) === 400 &&
    microsoftErrorCode(error) === "ExtensionError"
  );
}
