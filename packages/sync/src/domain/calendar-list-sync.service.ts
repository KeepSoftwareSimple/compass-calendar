import {
  type ProviderCalendarId,
  type ProviderCalendarSourceId,
} from "@core/types/sync/identity.contracts";
import { discoverCalendarsWithAuthRetry } from "@sync/domain/discover-calendars-with-auth-retry";
import { type AccessTokenSource } from "@sync/domain/provider-write-ladder";
import {
  type ProviderCalendarAdapter,
  ProviderCalendarError,
} from "@sync/providers/provider-calendar.port";
import { resourceJob } from "@sync/storage/contracts/job.contracts";
import { type ProviderConnectionRecord } from "@sync/storage/contracts/provider-connection.contracts";
import { type SyncResourceRecord } from "@sync/storage/contracts/sync-resource.contracts";
import { type JobRepository } from "@sync/storage/repositories/job.repository";
import { type ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { type SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

// How long an unwatchable verdict must stand before a full pass gives that
// calendar another watch attempt. Scopes the retry to the verdict rather than to
// however often full passes run, which stopped being daily once a calendarList
// push started forcing one.
const WATCH_UNSUPPORTED_RETRY_AFTER_MS = 24 * 60 * 60_000;

export interface CalendarListSyncDeps {
  calendars: ProviderCalendarRepository;
  resources: SyncResourceRepository;
  jobs: JobRepository;
  discovery: ProviderCalendarAdapter;
  custody: AccessTokenSource;
  // Optional: a retirement is otherwise invisible (deactivateAbsent's result
  // was previously discarded entirely). Once discovery runs on a recurring
  // sweep rather than only at connect, retirements happen unattended and need
  // an audit trail. Defaults to a no-op so tests stay dependency-free.
  log?: { warn: (message: string) => void };
}

export interface CalendarListSyncResult {
  // How many calendars the provider returned this pass.
  readonly discovered: number;
  // How many active calendars had an initial import enqueued.
  readonly imported: number;
  // The connection's calendarList resource, re-read after the pass so the
  // caller sees the subscription fields as this pass left them.
  readonly resource: SyncResourceRecord;
  // A change notification landed while this pass was reading the provider, so
  // the pass may have listed a snapshot that predates it. The marker is left in
  // place; the caller owns going round again.
  readonly changedDuringSync: boolean;
}

// Discover a connection's calendars and bootstrap their sync. This is the front
// of the sync chain: a fresh connection has no calendars and no events resource,
// so nothing else can run until discovery populates them.
//
// Reconcile the provider's calendar list into `provider_calendars`, then for each
// ACTIVE calendar ensure its events resource and enqueue an initial import (which
// imports the events and, in turn, opens the push channel). The calendarList
// resource carries the discovery cursor so a later pass lists incrementally.
//
// A cursored (incremental) pass returns only changed calendars, so absence does
// NOT mean removal — only a FULL pass retires calendars no longer listed. An
// expired cursor drops to a full re-list rather than retrying a dead token; any
// other discovery failure throws so the worker retries with backoff.
//
// A full pass stamps lastFullListAt, which is the ONLY clock the rediscovery
// sweep selects on. It is not lastSuccessAt because incremental passes stamp
// that too: the web client's focus refreshes kept it perpetually fresh for
// active users, so they never aged into the sweep and the retirement pass never
// ran for exactly the people with the most calendar churn (2026-08-27).
export async function syncCalendarList(
  deps: CalendarListSyncDeps,
  connection: ProviderConnectionRecord,
  now: () => Date,
): Promise<CalendarListSyncResult> {
  const { tenantId, principalId, _id: connectionId } = connection;

  // The calendarList resource (one per connection, null calendarId) holds the
  // discovery cursor across passes.
  const resource = await deps.resources.ensure({
    tenantId,
    principalId,
    connectionId,
    resourceKind: "calendarList",
    calendarId: null,
  });

  // Stamp the attempt before the token fetch can fail, mirroring the events
  // pull's rotation invariant: the rediscovery sweep sorts calendarList
  // resources by lastAttemptAt, and without this every such resource ties at
  // null forever, letting a permanently-failing connection re-win the front of
  // every sweep cycle (the 2026-07-29 dead-credential tie-break pathology,
  // here for calendarList instead of events).
  await deps.resources.markAttempt(tenantId, principalId, resource._id, now());

  // Read the change marker BEFORE the provider read, mirroring the events
  // pull: everything this pass observes is a snapshot at or after this
  // instant, so a marker still holding this value at the end means no change
  // arrived that this pass could have missed.
  const notifiedAtStart = resource.changeNotifiedAt;

  const accessToken = await deps.custody.getValidAccessToken(connectionId);

  // Resume incrementally from the stored cursor; a cursorExpired verdict means
  // the token is too old, so re-list in full. Both leave `fullList` telling us
  // whether absence implies removal below. 401s remint in-process so a stale
  // cached access token does not stamp a durable discovery failure.
  let fullList = resource.syncCursor === null;
  let discovery: Awaited<
    ReturnType<ProviderCalendarAdapter["discoverCalendars"]>
  >;
  try {
    discovery = (
      await discoverCalendarsWithAuthRetry(deps, connectionId, {
        accessToken,
        cursor: resource.syncCursor ?? undefined,
      })
    ).discovery;
  } catch (error) {
    if (
      error instanceof ProviderCalendarError &&
      error.reason === "cursorExpired"
    ) {
      fullList = true;
      discovery = (
        await discoverCalendarsWithAuthRetry(deps, connectionId, {
          accessToken,
        })
      ).discovery;
    } else {
      // transient / discoveryFailed / unexpected: rethrow. Durable discovery
      // refusals (discoveryFailed) are settled as drops in dispatchSyncJob;
      // transient failures stay on the worker retry ladder.
      throw error;
    }
  }

  // Upsert every discovered calendar (identity is the provider calendar id, so a
  // rename keeps its Sync _id), keeping the persisted records to bootstrap the
  // active ones below.
  const upserted = [];
  for (const calendar of discovery.calendars) {
    const record = await deps.calendars.upsertByProviderCalendar({
      tenantId,
      principalId,
      connectionId,
      // The discovery port reports the provider's calendar id as a plain string;
      // it is the provider source id, branded on the way into storage.
      providerCalendarId:
        calendar.providerCalendarId as ProviderCalendarSourceId,
      displayName: calendar.displayName,
      color: calendar.color,
      eventLabels: calendar.eventLabels,
      active: calendar.active,
      primary: calendar.primary,
      accessRole: calendar.accessRole,
      capabilities: calendar.capabilities,
      createsGoogleMeet: calendar.createsGoogleMeet,
    });
    upserted.push(record);
  }

  // Only a full pass sees the complete set, so only then can a calendar's absence
  // mean it was removed. An incremental pass is BELIEVED to report a removal or a
  // hide as an active:false entry (handled by the upsert above), so it must not
  // retire the absent — but nothing in this repo can prove what Google actually
  // returns for a hidden-flag flip, and the fake behind the adapter seam cannot
  // observe it. The push path clears the cursor precisely so we re-enumerate
  // instead of resting on that belief.
  //
  // Guard on a non-empty result: an account always has at least a primary
  // calendar, so a full list of zero is treated as a non-answer (a provider
  // hiccup that returned empty instead of throwing) rather than "all removed" —
  // retiring every calendar on an empty blip would be user-visible damage.
  const appliedFullList = fullList && discovery.calendars.length > 0;
  let retiredIds: ProviderCalendarId[] = [];
  if (appliedFullList) {
    // A full pass is the retry cadence for unwatchable calendars: clear the
    // persisted watchUnsupportedAt verdicts so each gets one fresh watch
    // attempt (the pull path re-marks any the provider still refuses). The
    // age gate is what keeps that roughly daily now that a push also forces a
    // full pass — without it, a user editing their calendar list repeatedly
    // would burn a futile watch call per unwatchable calendar per edit.
    await deps.resources.clearWatchUnsupportedByConnection(
      tenantId,
      principalId,
      connectionId,
      new Date(now().getTime() - WATCH_UNSUPPORTED_RETRY_AFTER_MS),
    );
    retiredIds = await deps.calendars.deactivateAbsent(
      tenantId,
      principalId,
      connectionId,
      discovery.calendars.map(
        (c) => c.providerCalendarId as ProviderCalendarSourceId,
      ),
    );
    if (retiredIds.length > 0) {
      deps.log?.warn(
        `Sync retired ${retiredIds.length} calendar(s) absent from a full list on connection ${connectionId}: ${retiredIds.join(", ")}`,
      );
    }
  }

  // An inactive calendar — retired above for being absent from a full list, or
  // upserted inactive because the provider reports it deleted or hidden — can
  // never have its push channel renewed: dispatch drops subscriptionMaintain
  // for inactive calendars, so subscriptionExpiresAt never advances and the
  // row would squat at the head of every renewal sweep forever
  // (listExpiringSubscriptions sorts soonest-expiry first and now also
  // drops credential-less connections). The clear is one self-gating updateMany because hidden and
  // deleted calendars are re-reported inactive on EVERY daily full pass, not
  // just the transition one — steady state must cost one no-op write, not a
  // read of the connection's resources. Clearing the local fields, rather
  // than calling the provider to stop the channel, is deliberate: Google's
  // channels lapse on their own within 30 days, so the remote channel is a
  // harmless, self-healing wart, not something worth a provider call and a
  // new adapter dependency.
  //
  // The same pass mirrors calendar.active onto the events resource so the
  // stale-event finders never enqueue a pull for it. Reactivation stamps
  // true again so a later Refresh or sweep can resume.
  const inactiveIds = [
    ...new Set([
      ...retiredIds,
      ...upserted.filter((r) => !r.active).map((r) => r._id),
    ]),
  ];
  if (inactiveIds.length > 0) {
    await deps.resources.clearSubscriptionsByCalendarIds(
      tenantId,
      principalId,
      inactiveIds,
    );
    await deps.resources.setCalendarActiveByCalendarIds(
      tenantId,
      principalId,
      inactiveIds,
      false,
    );
  }
  const activeIds = upserted.filter((r) => r.active).map((r) => r._id);
  if (activeIds.length > 0) {
    await deps.resources.setCalendarActiveByCalendarIds(
      tenantId,
      principalId,
      activeIds,
      true,
    );
  }

  // Bootstrap events sync for each active calendar: ensure its events resource
  // and enqueue an initial import. The import is coalesced (same key an import
  // followup uses) and idempotent, so a re-discovery never double-imports.
  let imported = 0;
  for (const record of upserted) {
    if (!record.active) continue;
    const eventsResource = await deps.resources.ensure({
      tenantId,
      principalId,
      connectionId,
      resourceKind: "events",
      calendarId: record._id,
    });
    await deps.jobs.enqueue(
      resourceJob(eventsResource, "initialImport", now()),
    );
    imported += 1;
  }

  // Stamp success (and clear any prior durable discovery failure) even when the
  // provider returns no next sync token. Google normally returns a nextSyncToken
  // on the final page; a null cursor means leave the stored token alone and
  // full-list again next pass rather than writing null.
  await deps.resources.advanceCursor(
    tenantId,
    principalId,
    resource._id,
    discovery.cursor,
    now(),
  );

  // Advance the rediscovery sweep's staleness clock, but only for a pass that
  // actually applied a complete enumeration. Stamped HERE rather than inside the
  // appliedFullList block above so it means "a full pass persisted end to end" —
  // stamping before the reconciliation would let a throw partway through suppress
  // the sweep for a full day on a pass that never finished. An empty full list is
  // deliberately left unstamped (it is a provider non-answer, see above), so the
  // sweep retries it next tick; the lastAttemptAt-first sort is what keeps that
  // retry from squatting.
  if (appliedFullList) {
    await deps.resources.markFullListCompleted(
      tenantId,
      principalId,
      resource._id,
      now(),
    );
  }

  // Retire the change this pass served — but only if nothing moved the marker
  // while the provider was being read. A failed match means a notification
  // landed mid-pass (its enqueue coalesced onto this very job and vanished);
  // leave the newer marker in place and tell the caller to go round again.
  const served = await deps.resources.clearChangeNotifiedIfUnchanged(
    tenantId,
    principalId,
    resource._id,
    notifiedAtStart,
  );

  const updated = await deps.resources.findById(
    tenantId,
    principalId,
    resource._id,
  );
  return {
    discovered: discovery.calendars.length,
    imported,
    resource: updated ?? resource,
    changedDuringSync: !served,
  };
}
