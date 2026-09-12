import { type AccessTokenSource } from "@sync/domain/provider-write-ladder";
import {
  type ProviderNotificationAdapter,
  ProviderNotificationError,
} from "@sync/providers/provider-notifications.port";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import { type SyncResourceRecord } from "@sync/storage/contracts/sync-resource.contracts";
import { type SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";
import { randomUUID } from "node:crypto";

export interface SubscriptionMaintenanceDeps {
  resources: SyncResourceRepository;
  notifications: ProviderNotificationAdapter;
  custody: AccessTokenSource;
  // The absolute URL provider callbacks post back to (config's callback base +
  // the notifications route). Passed to the provider on watch; the callback then
  // arrives here and is matched to the stored subscription.
  callbackUrl: string;
  // From the connection provider's registry capabilities. Poll-only providers
  // (changeNotifications: false) short-circuit before any adapter call.
  supportsChangeNotifications: boolean;
}

export interface SubscriptionMaintenanceOptions {
  // Replace a subscription once it is within this window of expiring, so a
  // channel is renewed before it lapses and pushes never gap. A subscription
  // with more than this much life left is left alone.
  renewBeforeMs?: number;
}

export type SubscriptionMaintenanceOutcome =
  // A first channel was opened for a resource that had none.
  | { readonly status: "watched" }
  // An existing channel near expiry was replaced (and the old one stopped).
  | { readonly status: "renewed" }
  // The existing channel still has ample life; nothing was changed.
  | { readonly status: "current" }
  // The provider cannot push for this calendar; any stale channel was cleared
  // and the caller must rely on polling (the reconcile sweep) instead.
  | { readonly status: "unsupported" }
  // The credential is no longer valid; a reconnect re-bootstraps the channel, so
  // there is nothing to do here and retrying will not help.
  | { readonly status: "authRevoked" };

// One day, deliberately paired with the 48h channel lifetime the Google
// notification adapter requests (DEFAULT_TTL_MS): a channel becomes renewable
// about a day after it is opened, so the renewal sweep replaces every channel
// roughly daily. That cadence is the point, not a side effect — a channel can
// stop delivering WITHOUT expiring (Google drops one whose callbacks keep
// failing), and since every liveness path we have selects on
// subscriptionExpiresAt, re-watching on a cadence is what bounds how long such
// a channel can stay silently dead. Raising the provider TTL without raising
// this, or vice versa, changes that window — keep the two in step.
const DEFAULT_RENEW_BEFORE_MS = 24 * 60 * 60 * 1000;

// Ensure a resource has a live push channel: events.watch for a calendar, or
// calendarList.watch for the connection's calendar list. Open one if it has
// none, or replace one that is near expiry. The new channel is persisted
// BEFORE the old one is stopped, so a callback is always matchable — the reverse
// order would open a window where neither the old nor the new channel delivers.
//
// Idempotent enough to run twice: a resource whose channel still has plenty of
// life reports "current" and touches nothing, so a redundant maintain job (a
// racing sweep, a re-run after a crash) does not churn the channel.
//
// A transient watch failure throws so the worker retries with backoff. Terminal
// provider verdicts are folded into an outcome: an unwatchable or durably
// refused resource ("unsupported") falls back to polling, and a revoked
// credential ("authRevoked") waits for a reconnect. Both settle the job rather
// than burn the retry ladder (2026-08-07: one watchFailed job logged 78
// PostHog exceptions across 20 attempts before failing).
export async function maintainSubscription(
  deps: SubscriptionMaintenanceDeps,
  calendar: ProviderCalendarRecord | null,
  resource: SyncResourceRecord,
  now: () => Date,
  options: SubscriptionMaintenanceOptions = {},
): Promise<SubscriptionMaintenanceOutcome> {
  const renewBeforeMs = options.renewBeforeMs ?? DEFAULT_RENEW_BEFORE_MS;

  // Skip a healthy channel with more than the renew window left. A channel with
  // an id but no recorded expiry is treated as needing renewal (fail safe).
  if (
    resource.subscriptionId &&
    resource.subscriptionExpiresAt &&
    resource.subscriptionExpiresAt.getTime() - now().getTime() > renewBeforeMs
  ) {
    return { status: "current" };
  }

  if (!deps.supportsChangeNotifications) {
    if (resource.subscriptionId) {
      await deps.resources.clearSubscription(
        resource.tenantId,
        resource.principalId,
        resource._id,
      );
    }
    await deps.resources.markWatchUnsupported(
      resource.tenantId,
      resource.principalId,
      resource._id,
      now(),
    );
    return { status: "unsupported" };
  }

  const accessToken = await deps.custody.getValidAccessToken(
    resource.connectionId,
  );

  // The channel id and per-channel token are chosen here so the association is
  // known before the provider can deliver the first callback. The token is a
  // secret the provider echoes back and verifyNotification compares.
  const channelId = randomUUID();
  const channelToken = randomUUID();

  if (resource.resourceKind !== "calendarList" && !calendar) {
    throw new Error(
      `events subscription for resource ${resource._id} is missing its calendar`,
    );
  }

  let channel: Awaited<ReturnType<ProviderNotificationAdapter["watch"]>>;
  try {
    channel = await deps.notifications.watch({
      accessToken,
      // Undefined for a calendarList resource: watch the account's calendar
      // list instead of one calendar's events.
      calendarId:
        resource.resourceKind === "calendarList"
          ? undefined
          : calendar?.providerCalendarId,
      channelId,
      token: channelToken,
      callbackUrl: deps.callbackUrl,
    });
  } catch (error) {
    if (error instanceof ProviderNotificationError) {
      if (
        error.reason === "watchUnsupported" ||
        error.reason === "watchFailed"
      ) {
        // The provider will not open a channel for this calendar (unwatchable
        // resource, durable 4xx, or incomplete watch response). Drop any stale
        // channel so a lingering subscription id does not misroute a future
        // callback, and let the reconcile sweep's polling cover it. Treating
        // watchFailed as terminal matches the port comment ("refused") and
        // mirrors how durable readFailed settles instead of retrying (#2481).
        if (resource.subscriptionId) {
          await deps.resources.clearSubscription(
            resource.tenantId,
            resource.principalId,
            resource._id,
          );
        }
        // Persist the verdict so the pull path stops re-attempting a watch on
        // every cycle; the daily calendar-list full pass clears it for one
        // fresh attempt.
        await deps.resources.markWatchUnsupported(
          resource.tenantId,
          resource.principalId,
          resource._id,
          now(),
        );
        return { status: "unsupported" };
      }
      if (error.reason === "authorizationRevoked") {
        await deps.custody.discardRevoked(resource.connectionId);
        return { status: "authRevoked" };
      }
    }
    // transient or anything unexpected: let the worker retry with backoff.
    throw error;
  }

  const priorChannelId = resource.subscriptionId;
  const priorResourceId = resource.subscriptionResourceId;

  // Persist the new channel first so its callbacks verify immediately.
  await deps.resources.updateSubscription(
    resource.tenantId,
    resource.principalId,
    resource._id,
    {
      subscriptionId: channel.channelId,
      subscriptionResourceId: channel.resourceId,
      subscriptionToken: channelToken,
      subscriptionExpiresAt: channel.expiresAt,
      // A provider that validated the callback before opening the channel
      // has just reached this service's push endpoint, which is exactly what
      // pushLastReceivedAt records. Without it a quiet calendar on such a
      // provider looks identical to a broken route to the push-delivery
      // alarm, which fired on staging after every restart for Microsoft
      // subscriptions that had nothing to report.
      ...(channel.callbackVerified ? { pushLastReceivedAt: now() } : {}),
    },
  );

  if (priorChannelId && priorResourceId) {
    // Best effort: the new channel is already live and stored, so a failure to
    // stop the old one is not fatal — it lapses on its own, and its callbacks no
    // longer match the stored subscription so they are ignored meanwhile.
    try {
      await deps.notifications.stopChannel({
        accessToken,
        channelId: priorChannelId,
        resourceId: priorResourceId,
      });
    } catch {
      // Swallow: the stale channel expires without our help.
    }
    return { status: "renewed" };
  }

  return { status: "watched" };
}
