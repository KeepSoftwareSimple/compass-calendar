import { type Collection, type Db, ObjectId } from "mongodb";
import { type EventId } from "@core/types/domain-primitives";
import {
  type SyncCommandInput,
  type SyncCommandOutcome,
} from "@core/types/sync/command.contracts";
import {
  type ConnectionId,
  type PrincipalId,
  type ProviderCalendarId,
  type SyncCommandId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import {
  CommandReadSchema,
  type CommandRecord,
  type CommandSubmit,
  CommandSubmitSchema,
} from "@sync/storage/contracts/command.contracts";

// Repository for `commands`. Submitting is idempotent on
// (tenant, principal, idempotencyKey): a retried submission returns the
// existing command rather than creating a duplicate, so an interrupted or
// replayed submit is safe. Queries are scoped to the owning tenant/principal.
// A command still owed provider work: not yet applied, failed, or cancelled.
// One definition so the four nonterminal queries below can never drift.
const NONTERMINAL_COMMAND_STATES = ["pending", "applying", "reconciling"];

export class CommandRepository {
  private readonly collection: Collection<CommandRecord>;

  constructor(db: Db) {
    this.collection = db.collection<CommandRecord>(SYNC_COLLECTIONS.commands);
  }

  // Insert the command if its idempotency key is new; otherwise return the
  // command already stored for that key unchanged. New commands start pending
  // with a zero attempt count.
  async submit(
    input: CommandSubmit,
  ): Promise<{ record: CommandRecord; inserted: boolean }> {
    const fields = CommandSubmitSchema.parse(input);
    const now = new Date();

    const result = await this.collection.findOneAndUpdate(
      {
        tenantId: fields.tenantId,
        principalId: fields.principalId,
        idempotencyKey: fields.idempotencyKey,
      },
      {
        // Everything is set-on-insert: a repeated submit must not overwrite an
        // in-flight command's outcome or attempt count.
        $setOnInsert: {
          _id: new ObjectId().toHexString() as SyncCommandId,
          eventId: fields.eventId,
          input: fields.input,
          expectedVersion: fields.expectedVersion,
          outcome: { state: "pending" } as SyncCommandOutcome,
          attemptCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: "after", includeResultMetadata: true },
    );
    if (!result.value) {
      throw new Error("Submit did not return a command record");
    }
    return {
      record: CommandReadSchema.parse(result.value),
      inserted: result.lastErrorObject?.["upserted"] != null,
    };
  }

  // Reopen a terminal command back to pending, so submitCloudCommand's normal
  // pending-apply path re-executes it. The `expectedState` filter is the
  // concurrency guard: two simultaneous resubmits of the same stale terminal
  // command cannot both reopen it — the loser's write matches nothing and
  // gets null back, leaving the winner as the sole executor. `_id`,
  // `idempotencyKey`, and `attemptCount` are untouched, so the one-row-per-key
  // contract and the audit trail both survive the reopen.
  //
  // `input`, when given, replaces the command's stored payload before it
  // re-executes — needed for a restore reopen: `submit()` only ever sets
  // `input` on first insert, so without this a reopened create would
  // re-execute its ORIGINAL payload, not the (possibly since-edited) snapshot
  // the client is restoring. The idempotency key still means "the create of
  // event X" either way.
  async reopen(
    tenantId: TenantId,
    principalId: PrincipalId,
    id: SyncCommandId,
    expectedState: SyncCommandOutcome["state"],
    input?: SyncCommandInput,
  ): Promise<CommandRecord | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: id, tenantId, principalId, "outcome.state": expectedState },
      {
        $set: {
          outcome: { state: "pending" } as SyncCommandOutcome,
          updatedAt: new Date(),
          ...(input ? { input } : {}),
        },
      },
      { returnDocument: "after" },
    );
    return result ? CommandReadSchema.parse(result) : null;
  }

  async findById(
    tenantId: TenantId,
    principalId: PrincipalId,
    id: SyncCommandId,
  ): Promise<CommandRecord | null> {
    const record = await this.collection.findOne({
      _id: id,
      tenantId,
      principalId,
    });
    return record ? CommandReadSchema.parse(record) : null;
  }

  // Whether an unacknowledged Compass command still targets this event. An
  // incremental pull consults this before applying a provider deletion so it
  // never drops an event with a local edit/create still in flight — the Compass
  // intent reconciles against the provider rather than being silently lost.
  async hasNonterminalForEvent(
    tenantId: TenantId,
    principalId: PrincipalId,
    eventId: EventId,
  ): Promise<boolean> {
    const existing = await this.collection.findOne(
      {
        tenantId,
        principalId,
        eventId,
        "outcome.state": { $in: NONTERMINAL_COMMAND_STATES },
      },
      { projection: { _id: 1 } },
    );
    return existing !== null;
  }

  // Whether any OTHER command (any state) exists for this event, created after
  // the given one. Consulted by the stale-command retry sweep before
  // reapplying an old command's payload: reapplying stale content onto an
  // event a later command has since touched would silently revert whatever
  // that later command did. _id comparison (not createdAt) matches every
  // other "latest"/ordering query in this repository and is monotonic for
  // ObjectId-shaped ids from the same cluster.
  async hasNewerCommandForEvent(
    tenantId: TenantId,
    principalId: PrincipalId,
    eventId: EventId,
    afterId: SyncCommandId,
  ): Promise<boolean> {
    const newer = await this.collection.findOne(
      {
        tenantId,
        principalId,
        eventId,
        _id: { $gt: afterId },
      },
      { projection: { _id: 1 } },
    );
    return newer !== null;
  }

  // Record a state transition (pending -> applying -> confirmed/failed/...) and
  // the current attempt count. Returns the updated record, or null if the
  // command doesn't exist for this principal.
  async updateOutcome(
    tenantId: TenantId,
    principalId: PrincipalId,
    id: SyncCommandId,
    outcome: SyncCommandOutcome,
    attemptCount: number,
  ): Promise<CommandRecord | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: id, tenantId, principalId },
      { $set: { outcome, attemptCount, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    return result ? CommandReadSchema.parse(result) : null;
  }

  // Commands still working (not in a terminal state), oldest first — the queue
  // a worker drains. Terminal states are confirmed, failed, and cancelled.
  async listNonterminal(
    tenantId: TenantId,
    principalId: PrincipalId,
    limit: number,
  ): Promise<CommandRecord[]> {
    const records = await this.collection
      .find({
        tenantId,
        principalId,
        "outcome.state": { $in: NONTERMINAL_COMMAND_STATES },
      })
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray();
    return records.map((r) => CommandReadSchema.parse(r));
  }

  // Outstanding commands for one connection (support diagnostics / S45).
  // Provider work is keyed by linked event connectionId or by create/move
  // calendar targets on that connection.
  async countNonterminalByConnection(
    tenantId: TenantId,
    principalId: PrincipalId,
    connectionId: ConnectionId,
    calendarIds: readonly ProviderCalendarId[],
  ): Promise<number> {
    const matchOr: Record<string, unknown>[] = [
      { "event.connectionId": connectionId },
    ];
    if (calendarIds.length > 0) {
      matchOr.push({
        "input.kind": { $in: ["create", "move"] },
        "input.calendarId": { $in: calendarIds },
      });
    }

    const [result] = await this.collection
      .aggregate<{ count: number }>([
        {
          $match: {
            tenantId,
            principalId,
            "outcome.state": { $in: NONTERMINAL_COMMAND_STATES },
          },
        },
        {
          $lookup: {
            from: SYNC_COLLECTIONS.events,
            localField: "eventId",
            foreignField: "_id",
            as: "event",
          },
        },
        { $unwind: { path: "$event", preserveNullAndEmptyArrays: true } },
        { $match: { $or: matchOr } },
        { $count: "count" },
      ])
      .toArray();

    return result?.count ?? 0;
  }

  // Commands stuck nonterminal past `before`, across every owner (system
  // liveness, not a user request — same shape as JobRepository's failed-job
  // sweep query). A transient provider failure mid-execute returns the
  // command unchanged rather than retrying it (see provider-command.service.ts):
  // nothing else ever picks a pending command back up, so without this sweep
  // it stays visibly "deleting"/"updating" forever. Scoped to update/delete —
  // the kinds executed inline and synchronously from the HTTP request, so a
  // transient failure there has no other retry path at all.
  async listStaleNonterminal(
    before: Date,
    kinds: readonly SyncCommandInput["kind"][],
    limit: number,
  ): Promise<CommandRecord[]> {
    const records = await this.collection
      .find({
        "outcome.state": { $in: NONTERMINAL_COMMAND_STATES },
        "input.kind": { $in: kinds },
        updatedAt: { $lt: before },
      })
      .sort({ updatedAt: 1 })
      .limit(limit)
      .toArray();
    return records.map((r) => CommandReadSchema.parse(r));
  }

  // Hard-delete every command for a principal (account deletion).
  async deleteByPrincipal(
    tenantId: TenantId,
    principalId: PrincipalId,
  ): Promise<number> {
    const result = await this.collection.deleteMany({ tenantId, principalId });
    return result.deletedCount;
  }
}
