import {
  type AnyBulkWriteOperation,
  type Collection,
  type Db,
  ObjectId,
} from "mongodb";
import { type DateTime, type EventId } from "@core/types/domain-primitives";
import {
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import {
  type EventRecord,
  EventRecordSchema,
} from "@sync/storage/contracts/event.contracts";

// bulkWrite / $in chunks. Matches the 500-1000 doc batching Atlas round-trips
// want: one page of provider events is typically well under this, so a page
// is one command; a larger repair still stays bounded.
const WRITE_CHUNK_SIZE = 500;

// Fields for a provider-linked event upsert. Sync assigns _id/createdAt on
// first sight and dedupes on the (connection, calendar, providerEventId)
// identity so a repeated provider read never duplicates.
export type ProviderEventUpsert = Omit<
  EventRecord,
  "_id" | "createdAt" | "updatedAt"
> & {
  connectionId: NonNullable<EventRecord["connectionId"]>;
  providerEventId: NonNullable<EventRecord["providerEventId"]>;
};

export type UpsertByProviderIdentityOptions = {
  // When true, an incoming providerMetadata that omits iCalUID keeps any
  // existing iCalUID on the row. Cancelled exceptions pass false so they can
  // still clear the bag to null.
  preserveIcalUidWhenAbsent?: boolean;
};

export class EventRepository {
  private readonly collection: Collection<EventRecord>;

  constructor(db: Db) {
    this.collection = db.collection<EventRecord>(SYNC_COLLECTIONS.events);
  }

  // Generation on the events store is a "last touched by" watermark, NOT an
  // isolation key — deliberately unlike occurrences, which ARE generation-keyed
  // (a doc per generation) because the range read serves them by generation.
  // Nothing reads events by generation on any user path; the only reader is a
  // repair's own bookkeeping. So exactly one canonical doc exists per provider
  // identity, and re-importing it bumps its generation in place rather than
  // inserting a second doc — which is what makes stale-detection work: a repair
  // rebuilding into generation N leaves genuinely-deleted events stranded below
  // N (deleteStaleProviderEventsBelowGeneration), while re-seen ones ride
  // forward. Adding generation to the filter here (or to the unique
  // provider_event_identity index) would collide the second import and defeat
  // that signal. The filter therefore excludes generation on purpose.
  async upsertByProviderIdentity(
    input: ProviderEventUpsert,
    options?: UpsertByProviderIdentityOptions,
  ): Promise<EventRecord> {
    const [record] = await this.upsertManyByProviderIdentity([input], options);
    if (!record) throw new Error("Upsert did not return an event record");
    return record;
  }

  // Page-level form of upsertByProviderIdentity: one batched identity pre-read,
  // one batched exception-reconcile, then unordered bulkWrite chunks. Returns
  // records in input order. Duplicate provider identities in one call keep the
  // last input (unordered bulkWrite cannot target the same filter twice).
  async upsertManyByProviderIdentity(
    inputs: readonly ProviderEventUpsert[],
    options?: UpsertByProviderIdentityOptions,
  ): Promise<EventRecord[]> {
    if (inputs.length === 0) return [];
    const unique = lastByProviderIdentity(inputs);
    let written: EventRecord[];
    try {
      written = await this.#upsertManyByProviderIdentityOnce(unique, options);
    } catch (error) {
      if (
        !isDuplicateKeyError(error) ||
        !unique.some((input) => input.recurrence.kind === "exception")
      ) {
        throw error;
      }
      // Concurrent command upsert won a series key between reconcile and
      // insert. Reconcile again and retry once.
      written = await this.#upsertManyByProviderIdentityOnce(unique, options);
    }
    const byKey = new Map(
      written.map((record) => [providerIdentityKey(record), record]),
    );
    return inputs.map((input) => {
      const record = byKey.get(providerIdentityKey(input));
      if (!record) throw new Error("Upsert did not return an event record");
      return record;
    });
  }

  async #upsertManyByProviderIdentityOnce(
    inputs: readonly ProviderEventUpsert[],
    options: UpsertByProviderIdentityOptions | undefined,
  ): Promise<EventRecord[]> {
    const now = new Date();
    const existing = await this.#findExistingByProviderIdentity(inputs);
    const existingAfterReconcile =
      await this.#reconcileSeriesExceptionsBeforeProviderUpsert(
        inputs,
        existing,
      );

    const ops: AnyBulkWriteOperation<EventRecord>[] = [];
    const planned: {
      input: ProviderEventUpsert;
      existing: EventRecord | undefined;
      insertId: EventId;
      providerMetadata: EventRecord["providerMetadata"];
    }[] = [];

    for (const input of inputs) {
      const current = existingAfterReconcile.get(providerIdentityKey(input));
      const providerMetadata = options?.preserveIcalUidWhenAbsent
        ? mergeProviderMetadata(
            input.providerMetadata,
            current?.providerMetadata,
          )
        : input.providerMetadata;
      const insertId = (current?._id ??
        new ObjectId().toHexString()) as EventId;
      planned.push({ input, existing: current, insertId, providerMetadata });
      ops.push({
        updateOne: {
          filter: providerIdentityFilter(input),
          update: {
            $set: upsertSetFields(input, now, providerMetadata),
            $setOnInsert: { _id: insertId, createdAt: now },
          },
          upsert: true,
        },
      });
    }

    await this.#bulkWriteUnordered(ops);

    return planned.map(
      ({ input, existing: current, insertId, providerMetadata }) =>
        EventRecordSchema.parse({
          ...current,
          ...input,
          providerMetadata,
          customizations:
            input.customizations !== undefined
              ? input.customizations
              : current?.customizations,
          _id: current?._id ?? insertId,
          createdAt: current?.createdAt ?? now,
          updatedAt: now,
        }),
    );
  }

  // Stamp provider identity onto a series-keyed exception that lacks it (or
  // drop a divergent series-keyed duplicate) so the provider-identity upsert
  // that follows updates one document instead of colliding
  // series_exception_identity. One series-key find and one provider-identity
  // find for the whole page, then one unordered bulkWrite of stamps/deletes.
  // Mutates `existing` so a just-stamped tombstone is treated as the target
  // of the following upsert (same _id, now holding the provider id).
  async #reconcileSeriesExceptionsBeforeProviderUpsert(
    inputs: readonly ProviderEventUpsert[],
    existing: Map<string, EventRecord>,
  ): Promise<Map<string, EventRecord>> {
    const exceptions = inputs.filter(
      (
        input,
      ): input is ProviderEventUpsert & {
        recurrence: Extract<
          ProviderEventUpsert["recurrence"],
          { kind: "exception" }
        >;
      } => input.recurrence.kind === "exception",
    );
    if (exceptions.length === 0) return existing;

    const bySeries = await this.#findBySeriesExceptionKeys(exceptions);
    const ops: AnyBulkWriteOperation<EventRecord>[] = [];

    for (const input of exceptions) {
      const series = bySeries.get(seriesExceptionKey(input));
      if (!series) continue;
      const key = providerIdentityKey(input);
      const byProvider = existing.get(key);

      if (!byProvider) {
        ops.push({
          updateOne: {
            filter: {
              _id: series._id,
              tenantId: input.tenantId,
              principalId: input.principalId,
            },
            update: {
              $set: {
                connectionId: input.connectionId,
                providerEventId: input.providerEventId,
              },
            },
          },
        });
        existing.set(key, {
          ...series,
          connectionId: input.connectionId,
          providerEventId: input.providerEventId,
        });
        continue;
      }

      if (series._id !== byProvider._id) {
        ops.push({
          deleteOne: {
            filter: {
              _id: series._id,
              tenantId: input.tenantId,
              principalId: input.principalId,
            },
          },
        });
      }
    }

    await this.#bulkWriteUnordered(ops);
    return existing;
  }

  async #findExistingByProviderIdentity(
    inputs: readonly ProviderEventUpsert[],
  ): Promise<Map<string, EventRecord>> {
    const found = new Map<string, EventRecord>();
    for (const group of groupByCalendarIdentity(inputs)) {
      // The unique identity is (connection, calendar, providerEventId) —
      // the same filter upsert uses. Owner fields are not part of it; a
      // repeated read that rebuilds tenant/principal still has to land on
      // the same document.
      for (
        let i = 0;
        i < group.providerEventIds.length;
        i += WRITE_CHUNK_SIZE
      ) {
        const chunk = group.providerEventIds.slice(i, i + WRITE_CHUNK_SIZE);
        const records = await this.collection
          .find({
            connectionId: group.connectionId,
            calendarId: group.calendarId,
            $and: [
              { providerEventId: { $in: chunk } },
              { providerEventId: { $type: "string" } },
            ],
          })
          .toArray();
        for (const record of records) {
          const parsed = EventRecordSchema.parse(record);
          if (!parsed.providerEventId) continue;
          found.set(
            providerIdentityKey({
              connectionId: group.connectionId,
              calendarId: group.calendarId,
              providerEventId: parsed.providerEventId,
            }),
            parsed,
          );
        }
      }
    }
    return found;
  }

  async #findBySeriesExceptionKeys(
    inputs: readonly (ProviderEventUpsert & {
      recurrence: Extract<
        ProviderEventUpsert["recurrence"],
        { kind: "exception" }
      >;
    })[],
  ): Promise<Map<string, EventRecord>> {
    const found = new Map<string, EventRecord>();
    if (inputs.length === 0) return found;

    for (let i = 0; i < inputs.length; i += WRITE_CHUNK_SIZE) {
      const chunk = inputs.slice(i, i + WRITE_CHUNK_SIZE);
      const records = await this.collection
        .find({
          $or: chunk.map((input) => ({
            tenantId: input.tenantId,
            principalId: input.principalId,
            "recurrence.kind": "exception" as const,
            "recurrence.seriesId": input.recurrence.seriesId,
            "recurrence.recurrenceId": input.recurrence.recurrenceId,
          })),
        })
        .toArray();
      for (const record of records) {
        const parsed = EventRecordSchema.parse(record);
        if (parsed.recurrence.kind !== "exception") continue;
        found.set(
          seriesExceptionKey({
            tenantId: parsed.tenantId,
            principalId: parsed.principalId,
            recurrence: parsed.recurrence,
          }),
          parsed,
        );
      }
    }
    return found;
  }

  async #bulkWriteUnordered(
    ops: AnyBulkWriteOperation<EventRecord>[],
  ): Promise<void> {
    if (ops.length === 0) return;
    for (let i = 0; i < ops.length; i += WRITE_CHUNK_SIZE) {
      await this.collection.bulkWrite(ops.slice(i, i + WRITE_CHUNK_SIZE), {
        ordered: false,
      });
    }
  }

  // Full write of a Compass (or already-identified) event by its _id. Used for
  // unlinked cloud events and for promoting/relinking an existing event. The
  // filter is scoped to the owning tenant/principal, not _id alone: _id is the
  // client-supplied event id, so an unscoped replace would let one principal
  // overwrite another's event by reusing its id. Scoping means a foreign id
  // collides on the unique _id at insert (a caught error) instead of silently
  // clobbering the owner's document.
  async put(record: EventRecord): Promise<EventRecord> {
    const parsed = EventRecordSchema.parse(record);
    await this.collection.replaceOne(
      {
        _id: parsed._id,
        tenantId: parsed.tenantId,
        principalId: parsed.principalId,
      },
      parsed,
      { upsert: true },
    );
    return parsed;
  }

  async findById(
    tenantId: TenantId,
    principalId: PrincipalId,
    id: EventId,
  ): Promise<EventRecord | null> {
    const record = await this.collection.findOne({
      _id: id,
      tenantId,
      principalId,
    });
    return record ? EventRecordSchema.parse(record) : null;
  }

  // Batch-hydrate full event records by id, owner-scoped. The full-fidelity read
  // uses this to join a page of occurrence rows back to their owning events (and
  // then those events' series masters). Not generation-filtered: an event is
  // unique per identity, and generation on `events` is only a last-touched
  // watermark, never a read key. An empty id list short-circuits to no query.
  async findByIds(
    tenantId: TenantId,
    principalId: PrincipalId,
    ids: readonly EventId[],
  ): Promise<EventRecord[]> {
    if (ids.length === 0) return [];
    const records = await this.collection
      .find({ _id: { $in: [...ids] }, tenantId, principalId })
      .toArray();
    return records.map((record) => EventRecordSchema.parse(record));
  }

  // Look up one provider-linked event by its provider identity, owner-scoped.
  // Import uses this to resolve a series instance's provider parent to the
  // locally stored master when the master arrived in an earlier page or run.
  async findByProviderIdentity(
    tenantId: TenantId,
    principalId: PrincipalId,
    identity: {
      connectionId: NonNullable<EventRecord["connectionId"]>;
      calendarId: EventRecord["calendarId"];
      providerEventId: NonNullable<EventRecord["providerEventId"]>;
    },
  ): Promise<EventRecord | null> {
    const record = await this.collection.findOne({
      tenantId,
      principalId,
      connectionId: identity.connectionId,
      calendarId: identity.calendarId,
      // $type: see the PLANNER TRAP note in index-manifest.ts.
      providerEventId: { $eq: identity.providerEventId, $type: "string" },
    });
    return record ? EventRecordSchema.parse(record) : null;
  }

  // Batch form of findByProviderIdentity: one $in per chunk instead of one
  // findOne per event. Empty id lists short-circuit. Returns a map keyed by
  // providerEventId; missing identities are absent, not null.
  async findByProviderIdentities(
    tenantId: TenantId,
    principalId: PrincipalId,
    identity: {
      connectionId: NonNullable<EventRecord["connectionId"]>;
      calendarId: EventRecord["calendarId"];
      providerEventIds: readonly NonNullable<EventRecord["providerEventId"]>[];
    },
  ): Promise<Map<string, EventRecord>> {
    const ids = [...new Set(identity.providerEventIds)];
    const found = new Map<string, EventRecord>();
    if (ids.length === 0) return found;
    for (let i = 0; i < ids.length; i += WRITE_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + WRITE_CHUNK_SIZE);
      const records = await this.collection
        .find({
          tenantId,
          principalId,
          connectionId: identity.connectionId,
          calendarId: identity.calendarId,
          // $type: see the PLANNER TRAP note in index-manifest.ts. $in of
          // strings does not itself prove the partial-index predicate, so the
          // $type clause is a sibling under $and rather than a sibling of $in
          // (memory-server treats `{ $in, $type }` as matching nothing).
          $and: [
            { providerEventId: { $in: chunk } },
            { providerEventId: { $type: "string" } },
          ],
        })
        .toArray();
      for (const record of records) {
        const parsed = EventRecordSchema.parse(record);
        if (parsed.providerEventId) {
          found.set(parsed.providerEventId, parsed);
        }
      }
    }
    return found;
  }

  // Resolve a CalDAV resource href to a stored provider event. Incremental
  // sync-collection deletions report only the href; import stores it in
  // providerMetadata.href so pulls can map back to providerEventId.
  async findByProviderResourceHref(
    tenantId: TenantId,
    principalId: PrincipalId,
    identity: {
      connectionId: NonNullable<EventRecord["connectionId"]>;
      calendarId: EventRecord["calendarId"];
      href: string;
    },
  ): Promise<EventRecord | null> {
    const record = await this.collection.findOne({
      tenantId,
      principalId,
      connectionId: identity.connectionId,
      calendarId: identity.calendarId,
      "providerMetadata.href": identity.href,
    });
    return record ? EventRecordSchema.parse(record) : null;
  }

  // Remove one event by id, scoped to its owner so a caller can only delete its
  // own event. Idempotent: deleting an already-absent event is a no-op, so a
  // retried delete converges. Returns whether a document was removed.
  async deleteById(
    tenantId: TenantId,
    principalId: PrincipalId,
    id: EventId,
  ): Promise<boolean> {
    const result = await this.collection.deleteOne({
      _id: id,
      tenantId,
      principalId,
    });
    return result.deletedCount > 0;
  }

  // Replace an existing event, owner-scoped and WITHOUT upsert, so a write can
  // never resurrect a document a concurrent delete already removed. Returns
  // whether a document was matched; false means the event vanished since it was
  // read, and the caller should re-evaluate rather than treat it as applied.
  async replaceExisting(record: EventRecord): Promise<boolean> {
    const parsed = EventRecordSchema.parse(record);
    const result = await this.collection.replaceOne(
      {
        _id: parsed._id,
        tenantId: parsed.tenantId,
        principalId: parsed.principalId,
      },
      parsed,
      { upsert: false },
    );
    return result.matchedCount > 0;
  }

  // Create or update the one exception (overridden or cancelled instance) of a
  // series at a given recurrence instant, mirroring the master's calendar and
  // provider identity. Keyed on (owner, seriesId, recurrenceId) and race-safe
  // via the unique series_exception_identity index, so a scope-"this" edit or
  // delete is idempotent — a retry lands on the same exception rather than a
  // duplicate. Returns the stored exception (with its assigned _id).
  //
  // Generation is a watermark here too (see upsertByProviderIdentity): a repair
  // re-seeing an exception bumps it into the new generation in place, so the
  // filter excludes generation and the index stays generation-free by design.
  //
  // Provider-linked exceptions have a second identity: provider_event_identity.
  // Import writes them via upsertByProviderIdentity; commands write via this
  // method. When a prior import already stored the instance under its provider
  // id (possibly with a differently-formatted recurrenceId string for the same
  // instant), we must converge on that document — inserting a second row with
  // the same providerEventId throws E11000 on provider_event_identity and left
  // staleCommandRetry looping on the failed command.
  async upsertException(
    master: EventRecord,
    recurrenceId: DateTime,
    override: {
      content: EventRecord["content"];
      schedule: EventRecord["schedule"];
      cancelled: boolean;
      // The instance's OWN provider identity, when it has one distinct from
      // the master's. A provider-linked occurrence (Google instance) is its
      // own addressable provider event — mirroring the master's identity
      // here would collide the provider_event_identity unique index, since
      // the master record already holds that exact (connectionId,
      // calendarId, providerEventId) triple. Omitted (key absent) falls back
      // to the master's identity, which is correct for a cloud-only series
      // (always null on both sides). Pass `null` explicitly — not omit — for
      // a provider-linked exception with no live provider counterpart (e.g.
      // an instance already gone at the provider): omitting would fall back
      // to the master's own (non-null) identity and collide the same index.
      providerIdentity?: {
        providerEventId: EventRecord["providerEventId"];
        providerVersion: EventRecord["providerVersion"];
      } | null;
    },
    now: Date,
  ): Promise<EventRecord> {
    const hasExplicitProviderIdentity = "providerIdentity" in override;
    const providerEventId = hasExplicitProviderIdentity
      ? (override.providerIdentity?.providerEventId ?? null)
      : master.providerEventId;
    const providerVersion = hasExplicitProviderIdentity
      ? (override.providerIdentity?.providerVersion ?? null)
      : master.providerVersion;

    const fields = {
      origin: master.origin,
      calendarId: master.calendarId,
      clientEventId: null,
      connectionId: master.connectionId,
      providerEventId,
      providerVersion,
      providerUpdatedAt: master.providerUpdatedAt,
      deliveryState: master.connectionId ? "confirmed" : master.deliveryState,
      providerMetadata: master.providerMetadata,
      content: override.content,
      schedule: override.schedule,
      "recurrence.cancelled": override.cancelled,
      lifecycleState: "active" as const,
      generation: master.generation,
      updatedAt: now,
    };

    // Prefer the provider-identity document when one already exists (import
    // path). Drop a series-keyed duplicate that lost the string-form match so
    // updating recurrenceId onto the provider row cannot hit
    // series_exception_identity.
    if (providerEventId !== null && master.connectionId) {
      const converged = await this.#convergeExceptionOntoProviderIdentity(
        master,
        recurrenceId,
        providerEventId,
        fields,
      );
      if (converged) return converged;
    }

    try {
      const result = await this.collection.findOneAndUpdate(
        {
          tenantId: master.tenantId,
          principalId: master.principalId,
          "recurrence.kind": "exception",
          "recurrence.seriesId": master._id,
          "recurrence.recurrenceId": recurrenceId,
        },
        {
          // Mirror the master's ownership/calendar identity; set the
          // instance's own content, schedule, provider identity, and cancelled
          // flag. recurrence.kind/seriesId/recurrenceId are seeded from the
          // filter on insert, so only cancelled is set here (setting the whole
          // recurrence would conflict).
          $set: fields,
          $setOnInsert: {
            _id: new ObjectId().toHexString() as EventId,
            createdAt: now,
            confirmedAt: now,
          },
        },
        { upsert: true, returnDocument: "after" },
      );
      if (!result) throw new Error("Exception upsert did not return a record");
      return EventRecordSchema.parse(result);
    } catch (error) {
      // Concurrent import won the provider_event_identity insert between our
      // lookup and this upsert. Converge on that row instead of failing the
      // command (which staleCommandRetry would then loop on forever).
      if (
        isDuplicateKeyError(error) &&
        providerEventId !== null &&
        master.connectionId
      ) {
        const converged = await this.#convergeExceptionOntoProviderIdentity(
          master,
          recurrenceId,
          providerEventId,
          fields,
        );
        if (converged) return converged;
      }
      throw error;
    }
  }

  // Update the existing provider-identity row into the series exception shape
  // the command wants. Removes a series-keyed duplicate first when the two
  // identities diverged (offset vs UTC recurrenceId strings for one instant).
  async #convergeExceptionOntoProviderIdentity(
    master: EventRecord,
    recurrenceId: DateTime,
    providerEventId: NonNullable<EventRecord["providerEventId"]>,
    fields: Record<string, unknown>,
  ): Promise<EventRecord | null> {
    if (!master.connectionId) return null;
    const byProvider = await this.findByProviderIdentity(
      master.tenantId,
      master.principalId,
      {
        connectionId: master.connectionId,
        calendarId: master.calendarId,
        providerEventId,
      },
    );
    if (!byProvider) return null;

    const bySeries = await this.collection.findOne({
      tenantId: master.tenantId,
      principalId: master.principalId,
      "recurrence.kind": "exception",
      "recurrence.seriesId": master._id,
      "recurrence.recurrenceId": recurrenceId,
    });
    if (bySeries && bySeries._id !== byProvider._id) {
      await this.collection.deleteOne({
        _id: bySeries._id,
        tenantId: master.tenantId,
        principalId: master.principalId,
      });
    }

    const result = await this.collection.findOneAndUpdate(
      {
        _id: byProvider._id,
        tenantId: master.tenantId,
        principalId: master.principalId,
      },
      {
        $set: {
          ...fields,
          "recurrence.kind": "exception",
          "recurrence.seriesId": master._id,
          "recurrence.recurrenceId": recurrenceId,
        },
      },
      { returnDocument: "after" },
    );
    if (!result) {
      throw new Error("Exception provider-identity update returned no record");
    }
    return EventRecordSchema.parse(result);
  }

  // Every exception event of a series (overridden or cancelled instances),
  // owner-scoped. Used by a scope-"all" series edit/delete to clean up the
  // instances the master's own record doesn't cover. A series has a bounded,
  // realistic number of exceptions, so this is unpaginated.
  async findSeriesExceptions(
    tenantId: TenantId,
    principalId: PrincipalId,
    seriesId: EventId,
  ): Promise<EventRecord[]> {
    const records = await this.collection
      .find({
        tenantId,
        principalId,
        "recurrence.kind": "exception",
        "recurrence.seriesId": seriesId,
      })
      .toArray();
    return records.map((r) => EventRecordSchema.parse(r));
  }

  // Batch form of findSeriesExceptions: one $in for every series touched on a
  // page, grouped by seriesId. Empty id lists short-circuit.
  async findSeriesExceptionsBySeriesIds(
    tenantId: TenantId,
    principalId: PrincipalId,
    seriesIds: readonly EventId[],
  ): Promise<Map<EventId, EventRecord[]>> {
    const ids = [...new Set(seriesIds)];
    const found = new Map<EventId, EventRecord[]>(ids.map((id) => [id, []]));
    if (ids.length === 0) return found;
    for (let i = 0; i < ids.length; i += WRITE_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + WRITE_CHUNK_SIZE);
      const records = await this.collection
        .find({
          tenantId,
          principalId,
          "recurrence.kind": "exception",
          "recurrence.seriesId": { $in: chunk },
        })
        .toArray();
      for (const record of records) {
        const parsed = EventRecordSchema.parse(record);
        if (parsed.recurrence.kind !== "exception") continue;
        found.get(parsed.recurrence.seriesId)?.push(parsed);
      }
    }
    return found;
  }

  // Remove a calendar's provider-linked events left below a generation — the
  // ones a completed repair did NOT re-import (deleted at the provider), since a
  // re-imported event's identity upsert bumped it to the new generation.
  // Compass-owned events (no providerEventId) are preserved: they carry local
  // intent the provider result can't speak to. Owner-scoped and idempotent.
  async deleteStaleProviderEventsBelowGeneration(
    tenantId: TenantId,
    principalId: PrincipalId,
    calendarId: EventRecord["calendarId"],
    generation: number,
  ): Promise<void> {
    await this.collection.deleteMany({
      tenantId,
      principalId,
      calendarId,
      generation: { $lt: generation },
      providerEventId: { $ne: null },
    });
  }

  // Hard-delete every provider-linked event for one connection (retention).
  async deleteByConnection(
    tenantId: TenantId,
    principalId: PrincipalId,
    connectionId: NonNullable<EventRecord["connectionId"]>,
  ): Promise<number> {
    const result = await this.collection.deleteMany({
      tenantId,
      principalId,
      connectionId,
    });
    return result.deletedCount;
  }

  // Hard-delete every event for a principal (account deletion).
  async deleteByPrincipal(
    tenantId: TenantId,
    principalId: PrincipalId,
  ): Promise<number> {
    const result = await this.collection.deleteMany({ tenantId, principalId });
    return result.deletedCount;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === 11000
  ) {
    return true;
  }
  const writeErrors = (
    error as { writeErrors?: readonly { code?: unknown }[] } | null
  )?.writeErrors;
  return writeErrors?.some((entry) => entry.code === 11000) ?? false;
}

function providerIdentityFilter(input: {
  connectionId: NonNullable<EventRecord["connectionId"]>;
  calendarId: EventRecord["calendarId"];
  providerEventId: NonNullable<EventRecord["providerEventId"]>;
}): {
  connectionId: NonNullable<EventRecord["connectionId"]>;
  calendarId: EventRecord["calendarId"];
  providerEventId: {
    $eq: NonNullable<EventRecord["providerEventId"]>;
    $type: "string";
  };
} {
  return {
    connectionId: input.connectionId,
    calendarId: input.calendarId,
    // $type is a semantic no-op but makes the provider_event_identity
    // partial index provable to the planner — without it, COLLSCAN.
    // See the PLANNER TRAP note in index-manifest.ts.
    providerEventId: { $eq: input.providerEventId, $type: "string" },
  };
}

function providerIdentityKey(input: {
  connectionId: EventRecord["connectionId"];
  calendarId: EventRecord["calendarId"];
  providerEventId: EventRecord["providerEventId"];
}): string {
  return `${input.connectionId}:${input.calendarId}:${input.providerEventId}`;
}

function seriesExceptionKey(input: {
  tenantId: TenantId;
  principalId: PrincipalId;
  recurrence: Extract<EventRecord["recurrence"], { kind: "exception" }>;
}): string {
  return `${input.tenantId}:${input.principalId}:${input.recurrence.seriesId}:${input.recurrence.recurrenceId}`;
}

function lastByProviderIdentity(
  inputs: readonly ProviderEventUpsert[],
): ProviderEventUpsert[] {
  const unique = new Map<string, ProviderEventUpsert>();
  for (const input of inputs) unique.set(providerIdentityKey(input), input);
  return [...unique.values()];
}

function groupByCalendarIdentity(inputs: readonly ProviderEventUpsert[]): {
  tenantId: TenantId;
  principalId: PrincipalId;
  connectionId: NonNullable<EventRecord["connectionId"]>;
  calendarId: EventRecord["calendarId"];
  providerEventIds: NonNullable<EventRecord["providerEventId"]>[];
}[] {
  const groups = new Map<
    string,
    {
      tenantId: TenantId;
      principalId: PrincipalId;
      connectionId: NonNullable<EventRecord["connectionId"]>;
      calendarId: EventRecord["calendarId"];
      providerEventIds: NonNullable<EventRecord["providerEventId"]>[];
    }
  >();
  for (const input of inputs) {
    const key = `${input.tenantId}:${input.principalId}:${input.connectionId}:${input.calendarId}`;
    const group = groups.get(key);
    if (group) {
      group.providerEventIds.push(input.providerEventId);
    } else {
      groups.set(key, {
        tenantId: input.tenantId,
        principalId: input.principalId,
        connectionId: input.connectionId,
        calendarId: input.calendarId,
        providerEventIds: [input.providerEventId],
      });
    }
  }
  return [...groups.values()];
}

function upsertSetFields(
  input: ProviderEventUpsert,
  now: Date,
  providerMetadata: EventRecord["providerMetadata"],
): Record<string, unknown> {
  const {
    customizations,
    providerMetadata: _incomingMetadata,
    ...fields
  } = input;
  const set: Record<string, unknown> = {
    ...fields,
    providerMetadata,
    updatedAt: now,
  };
  if (customizations !== undefined) set["customizations"] = customizations;
  return set;
}

// Merge rules for the provider-fact bag: incoming wins for a present iCalUID;
// if incoming omits iCalUID but the existing row has one, keep it so a sparse
// re-read cannot wipe a backfill or a prior full read; incoming null with no
// existing iCalUID stays null (busy default).
function mergeProviderMetadata(
  incoming: EventRecord["providerMetadata"],
  existing: EventRecord["providerMetadata"] | undefined,
): EventRecord["providerMetadata"] {
  const existingUid = existing?.["iCalUID"] ?? null;
  if (incoming === null) {
    return existingUid ? { iCalUID: existingUid } : null;
  }
  if (incoming["iCalUID"]) return incoming;
  if (existingUid) return { ...incoming, iCalUID: existingUid };
  return incoming;
}
