import {
  type PurgeUserAuth,
  type PurgeUserCounts,
  type PurgeUserReport,
  type PurgeUserResult,
  type PurgeUserTarget,
} from "@scripts/commands/purge-user/report.types";
import {
  type Collection,
  type Db,
  type Document,
  type Filter,
  type MongoClient,
  type ObjectId,
} from "mongodb";
import {
  PrincipalIdSchema,
  TenantIdSchema,
} from "@core/types/sync/identity.contracts";
import { normalizeEmail } from "@core/util/email.util";
import { Collections } from "@backend/common/constants/collections";
import { IS_DEV } from "@backend/common/constants/config.constants";
import { toSyncPrincipal } from "@backend/common/services/sync-service/sync-principal";
import { purgePrincipal } from "@sync/domain/principal-purge.service";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { CommandRepository } from "@sync/storage/repositories/command.repository";
import { CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { DeletionMarkerRepository } from "@sync/storage/repositories/deletion-marker.repository";
import { EventRepository } from "@sync/storage/repositories/event.repository";
import { EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { InvalidationRepository } from "@sync/storage/repositories/invalidation.repository";
import { JobRepository } from "@sync/storage/repositories/job.repository";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

// Collections no code writes anymore but whose rows still key off a user:
// `calendarlist` predates the 2025 calendar migration and `event_legacy_v1` is
// the pre-cutover event snapshot. Same IS_DEV naming the live ones use.
const LEGACY_CALENDAR_LIST = IS_DEV ? "_dev.calendarlist" : "calendarlist";
const LEGACY_EVENT = IS_DEV ? "_dev.event_legacy_v1" : "event_legacy_v1";
const WAITLIST = IS_DEV ? "_dev.waitlist" : "waitlist";

export interface PurgeUserDeps {
  /** The Compass API database (`prod_calendar` outside dev). */
  db: Db;
  /** The isolated Sync database (`compass_sync`). */
  syncDb: Db;
  syncClient: MongoClient;
  /**
   * Clears the SuperTokens user, id-mapping, and metadata for the email.
   * Optional and fail-open: a SuperTokens core the operator cannot reach must
   * not block (or half-undo) the Mongo purge.
   */
  cleanupAuth?: (email: string) => Promise<PurgeUserAuth>;
}

export interface PurgeUserOptions {
  dryRun: boolean;
  /** Echoed into the report so a dry run shows which deployment it read. */
  target: PurgeUserTarget;
  now?: Date;
}

interface UserDoc {
  _id: ObjectId;
  email: string;
  signedUpAt?: Date;
  lastLoggedInAt?: Date;
}

/**
 * Deletes every row Compass holds for one email address, across the API
 * database, the Sync database, and SuperTokens.
 *
 * Not transactional, by design: the Sync database is a separate deployment, so
 * no single session could span both. Instead the user document is deleted
 * last, so a failure part-way leaves the account visible and the command
 * rerunnable rather than leaving invisible orphans.
 */
export async function purgeUserByEmail(
  deps: PurgeUserDeps,
  email: string,
  options: PurgeUserOptions,
): Promise<PurgeUserReport> {
  const { dryRun } = options;
  const normalizedEmail = normalizeEmail(email);
  const users = await deps.db
    .collection<UserDoc>(Collections.USER)
    .find({ email: normalizedEmail })
    .toArray();

  const results: PurgeUserResult[] = [];
  for (const user of users) {
    results.push({
      userId: user._id.toString(),
      signedUpAt: user.signedUpAt?.toISOString() ?? null,
      lastLoggedInAt: user.lastLoggedInAt?.toISOString() ?? null,
      counts: await purgeOneUser(deps, user._id, dryRun),
    });
  }

  const waitlist = await removeMany(dryRun, deps.db.collection(WAITLIST), {
    email: normalizedEmail,
  });

  let auth: PurgeUserAuth | null = null;
  let authError: string | null = null;
  if (!dryRun && deps.cleanupAuth) {
    try {
      auth = await deps.cleanupAuth(normalizedEmail);
    } catch (error) {
      authError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    generatedAt: (options.now ?? new Date()).toISOString(),
    dryRun,
    email: normalizedEmail,
    target: options.target,
    users: results,
    waitlist,
    auth,
    authError,
  };
}

async function purgeOneUser(
  deps: PurgeUserDeps,
  userId: ObjectId,
  dryRun: boolean,
): Promise<PurgeUserCounts> {
  const id = userId.toString();

  // Snapshot first, and take every calendar - not just the active ones the
  // event service filters to. A calendar archived by a Google revoke still
  // owns events, and once its row is gone nothing can reach them: post-cutover
  // event documents carry only `calendarId`, never a user.
  const calendarIds = await deps.db
    .collection(Collections.CALENDAR)
    .find({ userId }, { projection: { _id: 1 } })
    .map((calendar) => calendar._id)
    .toArray();

  const events = calendarIds.length
    ? await removeMany(dryRun, deps.db.collection(Collections.EVENT), {
        calendarId: { $in: calendarIds },
      })
    : 0;
  const calendars = await removeMany(
    dryRun,
    deps.db.collection(Collections.CALENDAR),
    { userId },
  );
  const legacyCalendarLists = await removeMany(
    dryRun,
    deps.db.collection(LEGACY_CALENDAR_LIST),
    { user: id },
  );
  const legacyEvents = await removeMany(
    dryRun,
    deps.db.collection(LEGACY_EVENT),
    { user: id },
  );

  const sync = await purgeSyncRows(deps, id, dryRun);

  const user = await removeMany(dryRun, deps.db.collection(Collections.USER), {
    _id: userId,
  });

  return {
    events,
    calendars,
    legacyCalendarLists,
    legacyEvents,
    user,
    sync,
  };
}

/**
 * Applies the same purge the Sync service runs on account deletion. No
 * `custody` is passed, so credentials are dropped locally without a provider
 * revoke - purging staging test data must not disturb the real Google grant.
 */
async function purgeSyncRows(
  deps: PurgeUserDeps,
  userId: string,
  dryRun: boolean,
): Promise<PurgeUserCounts["sync"]> {
  // toSyncPrincipal owns the user-to-principal mapping; the schemas re-brand
  // its plain strings for the Sync repositories (and reject a malformed id).
  const principal = toSyncPrincipal(userId);
  const tenantId = TenantIdSchema.parse(principal.tenantId);
  const principalId = PrincipalIdSchema.parse(principal.principalId);

  if (dryRun) return countSyncRows(deps.syncDb, tenantId, principalId);

  return purgePrincipal(
    {
      connections: new ProviderConnectionRepository(deps.syncDb),
      credentials: new CredentialRepository(deps.syncDb),
      calendars: new ProviderCalendarRepository(deps.syncDb),
      events: new EventRepository(deps.syncDb),
      eventOccurrences: new EventOccurrenceRepository(
        deps.syncDb,
        deps.syncClient,
      ),
      syncResources: new SyncResourceRepository(deps.syncDb),
      commands: new CommandRepository(deps.syncDb),
      jobs: new JobRepository(deps.syncDb),
      deletionMarkers: new DeletionMarkerRepository(deps.syncDb),
      invalidations: new InvalidationRepository(deps.syncDb),
    },
    tenantId,
    principalId,
  );
}

// Every Sync collection is scoped by (tenantId, principalId) except
// credentials, which hang off a connection id.
async function countSyncRows(
  syncDb: Db,
  tenantId: string,
  principalId: string,
): Promise<PurgeUserCounts["sync"]> {
  const scope = { tenantId, principalId };
  const count = (name: string) => syncDb.collection(name).countDocuments(scope);

  const connectionIds = await syncDb
    .collection(SYNC_COLLECTIONS.providerConnections)
    .find(scope, { projection: { _id: 1 } })
    .map((connection) => connection._id)
    .toArray();

  return {
    connections: connectionIds.length,
    credentials: connectionIds.length
      ? await syncDb
          .collection(SYNC_COLLECTIONS.credentials)
          .countDocuments({ _id: { $in: connectionIds } })
      : 0,
    calendars: await count(SYNC_COLLECTIONS.providerCalendars),
    events: await count(SYNC_COLLECTIONS.events),
    eventOccurrences: await count(SYNC_COLLECTIONS.eventOccurrences),
    syncResources: await count(SYNC_COLLECTIONS.syncResources),
    commands: await count(SYNC_COLLECTIONS.commands),
    jobs: await count(SYNC_COLLECTIONS.jobs),
    deletionMarkers: await count(SYNC_COLLECTIONS.deletionMarkers),
    invalidations: await count(SYNC_COLLECTIONS.invalidations),
  };
}

/** Counts on a dry run, deletes on an apply. Same filter either way. */
async function removeMany(
  dryRun: boolean,
  collection: Collection<Document>,
  filter: Filter<Document>,
): Promise<number> {
  if (dryRun) return collection.countDocuments(filter);
  const result = await collection.deleteMany(filter);
  return result.deletedCount;
}
