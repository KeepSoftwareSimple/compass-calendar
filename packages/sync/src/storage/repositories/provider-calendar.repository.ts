import { type Collection, type Db, type Filter, ObjectId } from "mongodb";
import {
  type ConnectionId,
  type PrincipalId,
  type ProviderCalendarId,
  type ProviderCalendarSourceId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import {
  ProviderCalendarReadSchema,
  type ProviderCalendarRecord,
  type ProviderCalendarUpsert,
  ProviderCalendarUpsertSchema,
} from "@sync/storage/contracts/provider-calendar.contracts";

// Repository for `provider_calendars`. Upserts are keyed on
// (connection, provider-calendar id) so re-discovering a calendar updates one
// document; a renamed calendar keeps its Sync _id because identity is the
// provider's calendar id, not its display name. Queries are scoped
// to the owning tenant/principal.
export class ProviderCalendarRepository {
  private readonly collection: Collection<ProviderCalendarRecord>;

  constructor(db: Db) {
    this.collection = db.collection<ProviderCalendarRecord>(
      SYNC_COLLECTIONS.providerCalendars,
    );
  }

  async upsertByProviderCalendar(
    input: ProviderCalendarUpsert,
  ): Promise<ProviderCalendarRecord> {
    const fields = ProviderCalendarUpsertSchema.parse(input);
    const now = new Date();

    const result = await this.collection.findOneAndUpdate(
      {
        connectionId: fields.connectionId,
        providerCalendarId: fields.providerCalendarId,
      },
      {
        $set: {
          displayName: fields.displayName,
          color: fields.color,
          eventLabels: fields.eventLabels,
          active: fields.active,
          primary: fields.primary,
          accessRole: fields.accessRole,
          capabilities: fields.capabilities,
          createsGoogleMeet: fields.createsGoogleMeet,
          updatedAt: now,
        },
        $setOnInsert: {
          _id: new ObjectId().toHexString() as ProviderCalendarId,
          tenantId: fields.tenantId,
          principalId: fields.principalId,
          connectionId: fields.connectionId,
          providerCalendarId: fields.providerCalendarId,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );

    if (!result) {
      throw new Error("Upsert did not return a calendar record");
    }
    return ProviderCalendarReadSchema.parse(result);
  }

  // Mark inactive every calendar of a connection whose provider id is NOT in
  // `presentProviderCalendarIds`, and return the retired calendars' ids. Used
  // after a FULL discovery pass to retire calendars the account no longer lists
  // (an incremental pass must not call this — absence there means "unchanged",
  // not "removed"). Marking inactive rather than deleting keeps a calendar's
  // Sync _id (and any downstream preferences) if it later returns. Owner-scoped.
  // Ids are returned (not just a count) so the caller can log which calendars
  // were retired and clear their local push-channel state — once this runs on a
  // recurring sweep rather than only at connect, a silent retirement is no
  // longer auditable enough.
  async deactivateAbsent(
    tenantId: TenantId,
    principalId: PrincipalId,
    connectionId: ConnectionId,
    presentProviderCalendarIds: readonly ProviderCalendarSourceId[],
  ): Promise<ProviderCalendarId[]> {
    const filter: Filter<ProviderCalendarRecord> = {
      tenantId,
      principalId,
      connectionId,
      active: true,
      providerCalendarId: { $nin: [...presentProviderCalendarIds] },
    };
    const retired = await this.collection
      .find(filter)
      .project<{ _id: ProviderCalendarId }>({ _id: 1 })
      .toArray();
    if (retired.length === 0) return [];
    await this.collection.updateMany(filter, {
      $set: { active: false, updatedAt: new Date() },
    });
    return retired.map((r) => r._id);
  }

  async listByConnection(
    tenantId: TenantId,
    principalId: PrincipalId,
    connectionId: ConnectionId,
  ): Promise<ProviderCalendarRecord[]> {
    return this.listByPrincipal(tenantId, principalId, { connectionId });
  }

  async findById(
    tenantId: TenantId,
    principalId: PrincipalId,
    id: ProviderCalendarId,
  ): Promise<ProviderCalendarRecord | null> {
    const record = await this.collection.findOne({
      _id: id,
      tenantId,
      principalId,
    });
    return record ? ProviderCalendarReadSchema.parse(record) : null;
  }

  // List a principal's calendars, optionally narrowed to one connection and/or
  // to active calendars only. Always scoped to the owning tenant/principal.
  async listByPrincipal(
    tenantId: TenantId,
    principalId: PrincipalId,
    filter: { connectionId?: ConnectionId; activeOnly?: boolean } = {},
  ): Promise<ProviderCalendarRecord[]> {
    const query: Filter<ProviderCalendarRecord> = { tenantId, principalId };
    if (filter.connectionId) query.connectionId = filter.connectionId;
    if (filter.activeOnly) query.active = true;

    const records = await this.collection.find(query).toArray();
    return records.map((r) => ProviderCalendarReadSchema.parse(r));
  }

  // Hard-delete every calendar for one connection (post-disconnect retention).
  async deleteByConnection(
    tenantId: TenantId,
    principalId: PrincipalId,
    connectionId: ConnectionId,
  ): Promise<number> {
    const result = await this.collection.deleteMany({
      tenantId,
      principalId,
      connectionId,
    });
    return result.deletedCount;
  }

  // Hard-delete every calendar for a principal (account deletion).
  async deleteByPrincipal(
    tenantId: TenantId,
    principalId: PrincipalId,
  ): Promise<number> {
    const result = await this.collection.deleteMany({ tenantId, principalId });
    return result.deletedCount;
  }
}
