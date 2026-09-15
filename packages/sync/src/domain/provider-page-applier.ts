import { type DateTime, type EventId } from "@core/types/domain-primitives";
import { type SyncEventRecurrence } from "@core/types/sync/event.contracts";
import { type ProviderEventId } from "@core/types/sync/identity.contracts";
import { occurrenceScheduleAt } from "@sync/domain/occurrence-projection";
import { providerManagedMetadataEntry } from "@sync/domain/provider-managed-metadata";
import {
  type ReprojectBatchEntry,
  reprojectOccurrencesBatch,
} from "@sync/domain/reproject";
import {
  type ProviderEvent,
  type ProviderEventCancellation,
  type ProviderEventRead,
} from "@sync/providers/provider-event.port";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import {
  type EventRepository,
  type ProviderEventUpsert,
} from "@sync/storage/repositories/event.repository";
import { type EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";

// The stored provider-fact bag for an imported read, null when empty. Busy is
// the overwhelming default, so only a free ("transparent") event records its
// transparency. iCalUID is the provider's cross-copy correlation key (copies
// of one meeting on different accounts share it) — stored so duplicate
// meetings across connected accounts can be recognized downstream.
function providerMetadataFor(
  read: ProviderEvent,
): Record<string, string> | null {
  const metadata = {
    ...(read.busy ? {} : { transparency: "transparent" }),
    ...(read.icalUid ? { iCalUID: read.icalUid } : {}),
    ...providerManagedMetadataEntry(read.providerManaged),
    ...(read.resourceHref ? { href: read.resourceHref } : {}),
  };
  return Object.keys(metadata).length > 0 ? metadata : null;
}

// Applies pages of provider event reads to the canonical store, shared by
// initial import and incremental pull. It owns the parts both paths do
// identically: upserting masters/singles, linking series members (modified
// instances and cancelled occurrences) to their master as exceptions with their
// OWN provider identity, buffering members that arrive before their master,
// and reprojecting each touched series from a fresh exception read so the
// master's expansion excludes every excepted instant. All writes are idempotent
// provider-identity upserts, so replaying a page converges.
//
// Writes are page-level unordered bulkWrite plus one identity pre-read, so a
// 500-event page is a bounded handful of Mongo round trips rather than two to
// three per event. Events already written this run with the same etag/updated
// (the windowed import pass) are skipped on a later pass.
//
// It deliberately does NOT decide what a standalone cancellation means — a
// cancelled read with no series link is a whole-event deletion, which import
// ignores (no local event yet) but a pull must apply. `applyPage` returns those
// unconsumed so each caller applies its own deletion policy.
export class ProviderPageApplier {
  // Distinct provider event ids written, so replays (an overlapping windowed
  // pass, a crash-resumed page) never inflate the count.
  #importedIds = new Set<string>();
  // Records written this run, so a later pass can skip an unchanged etag and
  // still resolve masters without a store round-trip.
  #written = new Map<string, EventRecord>();
  // providerVersion + providerUpdatedAt fingerprint at write time.
  #writtenFingerprints = new Map<string, string>();
  // Local master by the PROVIDER's series id, for linking members without a
  // store round-trip once seen.
  #masters = new Map<string, EventRecord>();
  // Series members read before their master, awaiting it.
  #pending: ProviderEventRead[] = [];
  // Occurrence reprojections accumulated across the page (singles, masters,
  // exceptions), written in one batched transaction per flush instead of one
  // transaction per event — see event-occurrence.repository.ts's
  // replaceForEvents. Cleared by #flushProjections.
  #pendingProjections: ReprojectBatchEntry[] = [];

  constructor(
    private readonly events: EventRepository,
    private readonly occurrences: EventOccurrenceRepository,
    private readonly calendar: ProviderCalendarRecord,
    private readonly generation: number,
    private readonly now: () => Date,
  ) {}

  // Distinct events written so far (masters, singles, override and cancelled
  // exceptions).
  get importedCount(): number {
    return this.#importedIds.size;
  }

  // Apply one page's content and series-scoped cancellations. Masters are
  // upserted first so same-page members link without a buffer round-trip;
  // members whose master has not been seen are buffered and retried. Returns the
  // standalone (non-series) cancellations it did not consume, for the caller's
  // deletion policy.
  async applyPage(
    reads: readonly ProviderEventRead[],
  ): Promise<ProviderEventCancellation[]> {
    const touchedSeries = new Map<EventId, EventRecord>();
    const standaloneCancellations: ProviderEventCancellation[] = [];
    const masterReads: ProviderEvent[] = [];
    const singleReads: ProviderEvent[] = [];
    const memberReads: ProviderEventRead[] = [];

    for (const read of reads) {
      if (read.kind === "event" && read.recurrence.kind === "seriesMaster") {
        masterReads.push(read);
      } else if (read.kind === "event" && read.recurrence.kind === "single") {
        singleReads.push(read);
      } else if (this.#needsMaster(read)) {
        memberReads.push(read);
      } else if (read.kind === "cancellation") {
        standaloneCancellations.push(read);
      }
    }

    await this.#hydrateMasters(memberReads.map(seriesProviderId));

    for (const { read, record, wrote } of await this.#upsertEventReads(
      masterReads,
      (event) => {
        if (event.recurrence.kind !== "seriesMaster") {
          throw new Error("seriesMaster read expected");
        }
        return { kind: "seriesMaster", rules: event.recurrence.rules };
      },
      { preserveIcalUidWhenAbsent: true },
    )) {
      this.#masters.set(read.providerEventId, record);
      if (wrote) touchedSeries.set(record._id, record);
    }

    for (const { record, wrote } of await this.#upsertEventReads(
      singleReads,
      () => ({ kind: "single" }),
      { preserveIcalUidWhenAbsent: true },
    )) {
      if (wrote) this.#pendingProjections.push({ event: record });
    }

    const linked = await this.#linkMembers(memberReads);
    for (const master of linked.linkedMasters) {
      touchedSeries.set(master._id, master);
    }
    this.#pending.push(...linked.unresolved);
    // A buffered member's master may have arrived on this page.
    for (const master of await this.#drainPending()) {
      touchedSeries.set(master._id, master);
    }
    await this.#projectTouchedSeries([...touchedSeries.values()]);
    await this.#flushProjections();

    // Unresolved series cancellations are also standalone deletions: pull
    // applies them by full provider id before checkpointing this page, so a
    // crash-resume cannot drop a sparse instance-shaped cancel. A later page
    // that finds the master still tombstones via #pending.
    for (const read of this.#pending) {
      if (read.kind === "cancellation") {
        standaloneCancellations.push(read);
      }
    }

    return standaloneCancellations;
  }

  // Final pass: link any still-buffered member to a now-available master,
  // project the masters that gained one, and return how many members never
  // linked (a provider anomaly — an instant with no master in any page).
  // Unresolved series cancellations are also returned so pull can fall back
  // to standalone deletion by the full provider id — a rare standalone whose
  // Google id looks like an instance must not be stranded as an orphan.
  async finish(): Promise<{
    orphans: number;
    leftoverCancellations: ProviderEventCancellation[];
  }> {
    const relinked = await this.#drainPending();
    await this.#projectTouchedSeries(relinked);
    await this.#flushProjections();
    const leftoverCancellations = this.#pending.filter(
      (read): read is ProviderEventCancellation => read.kind === "cancellation",
    );
    const orphans = this.#pending.length;
    this.#pending = [];
    return { orphans, leftoverCancellations };
  }

  // Write every accumulated projection in this page as batched transactions
  // (chunked by occurrence document count so a very large page never
  // approaches Atlas's cache / 60s transaction lifetime limits).
  async #flushProjections(): Promise<void> {
    if (this.#pendingProjections.length === 0) return;
    const batch = this.#pendingProjections;
    this.#pendingProjections = [];
    await reprojectOccurrencesBatch(this.occurrences, batch, this.now);
  }

  // Whether a read is a series member that must resolve to a master before it
  // can be stored: a modified instance, or a cancelled occurrence of a series.
  #needsMaster(read: ProviderEventRead): boolean {
    if (read.kind === "event") return read.recurrence.kind === "instance";
    return read.series !== null;
  }

  // Try to link every still-buffered member to a now-available master. Returns
  // the masters that gained an exception, deduped, so the caller reprojects
  // each once. Projection is the caller's job, never done here.
  async #drainPending(): Promise<EventRecord[]> {
    if (this.#pending.length === 0) return [];
    await this.#hydrateMasters(this.#pending.map(seriesProviderId));
    const { linkedMasters, unresolved } = await this.#linkMembers(
      this.#pending,
    );
    this.#pending = unresolved;
    return linkedMasters;
  }

  // Store series members as exceptions of their locally stored masters, or
  // return those whose master is not resolvable yet. Every exception keeps its
  // OWN provider identity (a provider instance/cancellation is its own
  // provider event; reusing the master's id would violate the provider-identity
  // index). One bulkWrite per preserve/clear-metadata group.
  async #linkMembers(reads: readonly ProviderEventRead[]): Promise<{
    linkedMasters: EventRecord[];
    unresolved: ProviderEventRead[];
  }> {
    const unresolved: ProviderEventRead[] = [];
    const preserve: { read: ProviderEventRead; input: ProviderEventUpsert }[] =
      [];
    const clearMeta: {
      read: ProviderEventRead;
      input: ProviderEventUpsert;
    }[] = [];
    const mastersByRead = new Map<string, EventRecord>();

    for (const read of reads) {
      const master = this.#resolveMaster(seriesProviderId(read));
      if (!master) {
        unresolved.push(read);
        continue;
      }
      if (this.#isUnchanged(read)) {
        this.#importedIds.add(read.providerEventId);
        continue;
      }
      mastersByRead.set(read.providerEventId, master);
      if (read.kind === "event" && read.recurrence.kind === "instance") {
        preserve.push({
          read,
          input: this.#eventUpsert(read, {
            kind: "exception",
            seriesId: master._id,
            recurrenceId: read.recurrence.recurrenceId as DateTime,
            cancelled: false,
          }),
        });
      } else if (read.kind === "cancellation" && read.series) {
        clearMeta.push({
          read,
          input: this.#cancelledExceptionUpsert(read, master),
        });
      } else {
        throw new Error(
          "#linkMembers requires a series instance or series cancellation",
        );
      }
    }

    const relinked = new Map<EventId, EventRecord>();
    await this.#writeExceptionGroup(
      preserve,
      { preserveIcalUidWhenAbsent: true },
      mastersByRead,
      relinked,
    );
    await this.#writeExceptionGroup(
      clearMeta,
      undefined,
      mastersByRead,
      relinked,
    );

    return { linkedMasters: [...relinked.values()], unresolved };
  }

  async #writeExceptionGroup(
    group: readonly { read: ProviderEventRead; input: ProviderEventUpsert }[],
    options: { preserveIcalUidWhenAbsent: true } | undefined,
    mastersByRead: Map<string, EventRecord>,
    relinked: Map<EventId, EventRecord>,
  ): Promise<void> {
    if (group.length === 0) return;
    const records = await this.events.upsertManyByProviderIdentity(
      group.map((entry) => entry.input),
      options,
    );
    for (let i = 0; i < group.length; i += 1) {
      const entry = group[i];
      const record = records[i];
      if (!entry || !record) continue;
      this.#remember(entry.read, record);
      const master = mastersByRead.get(entry.read.providerEventId);
      if (master) relinked.set(master._id, master);
    }
  }

  // Store a cancelled series occurrence as a cancelled exception. A cancellation
  // read carries no content or schedule (providers strip them), so the tombstone
  // mirrors the master's content and derives its schedule from the cancelled
  // instant — the same shape a Compass-side scope-"this" delete writes.
  #cancelledExceptionUpsert(
    read: ProviderEventCancellation,
    master: EventRecord,
  ): ProviderEventUpsert {
    if (!read.series) {
      throw new Error(
        "upsertCancelledException requires a series cancellation",
      );
    }
    const recurrenceId = read.series.recurrenceId as DateTime;
    return {
      ...this.#upsertIdentity(read),
      providerUpdatedAt: null,
      providerMetadata: null,
      content: master.content,
      schedule: occurrenceScheduleAt(master.schedule, recurrenceId),
      recurrence: {
        kind: "exception",
        seriesId: master._id,
        recurrenceId,
        cancelled: true,
      },
    };
  }

  // Ownership, calendar, and provider identity are the same for every row this
  // applier writes; only the provider timestamp, the metadata bag, and the
  // content/schedule/recurrence differ between an imported read and a
  // cancellation tombstone.
  #upsertIdentity(
    read: Pick<ProviderEventRead, "providerEventId" | "providerVersion">,
  ) {
    return {
      tenantId: this.calendar.tenantId,
      principalId: this.calendar.principalId,
      origin: "provider" as const,
      calendarId: this.calendar._id,
      clientEventId: null,
      connectionId: this.calendar.connectionId,
      providerEventId: read.providerEventId as NonNullable<
        EventRecord["providerEventId"]
      >,
      providerVersion: read.providerVersion as NonNullable<
        EventRecord["providerVersion"]
      >,
      // Imported provider events carry no Compass delivery intent.
      deliveryState: null,
      lifecycleState: "active" as const,
      generation: this.generation,
      confirmedAt: this.now(),
    };
  }

  // The locally stored master for a provider series id: seen this run, or
  // written by an earlier page/run and hydrated in batch.
  #resolveMaster(seriesProviderId: string): EventRecord | null {
    return this.#masters.get(seriesProviderId) ?? null;
  }

  async #hydrateMasters(seriesProviderIds: readonly string[]): Promise<void> {
    const missing = [
      ...new Set(
        seriesProviderIds.filter(
          (id) => id.length > 0 && !this.#masters.has(id),
        ),
      ),
    ];
    if (missing.length === 0) return;
    const found = await this.events.findByProviderIdentities(
      this.calendar.tenantId,
      this.calendar.principalId,
      {
        connectionId: this.calendar.connectionId,
        calendarId: this.calendar._id,
        providerEventIds: missing as ProviderEventId[],
      },
    );
    for (const [id, stored] of found) {
      if (stored.recurrence.kind === "seriesMaster") {
        this.#masters.set(id, stored);
      }
    }
  }

  // Reproject each master from a fresh read of its exceptions (excluding their
  // instants), then each exception's own row. Fresh reads keep this correct
  // regardless of the order pages delivered the series. One find for the page.
  async #projectTouchedSeries(masters: readonly EventRecord[]): Promise<void> {
    if (masters.length === 0) return;
    const bySeries = await this.events.findSeriesExceptionsBySeriesIds(
      this.calendar.tenantId,
      this.calendar.principalId,
      masters.map((master) => master._id),
    );
    for (const master of masters) {
      const exceptions = bySeries.get(master._id) ?? [];
      const instants = exceptions.map((exception) => {
        if (exception.recurrence.kind !== "exception") {
          throw new Error("findSeriesExceptions returned a non-exception");
        }
        return exception.recurrence.recurrenceId;
      });
      this.#pendingProjections.push({
        event: master,
        excludedInstants: instants,
      });
      for (const exception of exceptions) {
        this.#pendingProjections.push({ event: exception });
      }
    }
  }

  async #upsertEventReads(
    reads: readonly ProviderEvent[],
    recurrenceFor: (read: ProviderEvent) => SyncEventRecurrence,
    options: { preserveIcalUidWhenAbsent: true },
  ): Promise<{ read: ProviderEvent; record: EventRecord; wrote: boolean }[]> {
    const results: {
      read: ProviderEvent;
      record: EventRecord;
      wrote: boolean;
    }[] = [];
    const toWrite: ProviderEvent[] = [];
    for (const read of reads) {
      if (this.#isUnchanged(read)) {
        const record = this.#written.get(read.providerEventId);
        if (!record) {
          throw new Error("unchanged fingerprint without a cached record");
        }
        this.#importedIds.add(read.providerEventId);
        results.push({ read, record, wrote: false });
      } else {
        toWrite.push(read);
      }
    }
    if (toWrite.length === 0) return results;
    const records = await this.events.upsertManyByProviderIdentity(
      toWrite.map((read) => this.#eventUpsert(read, recurrenceFor(read))),
      options,
    );
    for (let i = 0; i < toWrite.length; i += 1) {
      const read = toWrite[i];
      const record = records[i];
      if (!read || !record) continue;
      this.#remember(read, record);
      results.push({ read, record, wrote: true });
    }
    return results;
  }

  #eventUpsert(
    read: ProviderEvent,
    recurrence: SyncEventRecurrence,
  ): ProviderEventUpsert {
    return {
      ...this.#upsertIdentity(read),
      providerUpdatedAt: read.providerUpdatedAt
        ? new Date(read.providerUpdatedAt)
        : null,
      providerMetadata: providerMetadataFor(read),
      content: read.content,
      schedule: read.schedule,
      recurrence,
    };
  }

  #isUnchanged(read: ProviderEventRead): boolean {
    const previous = this.#writtenFingerprints.get(read.providerEventId);
    return previous !== undefined && previous === fingerprintOf(read);
  }

  #remember(read: ProviderEventRead, record: EventRecord): void {
    this.#importedIds.add(read.providerEventId);
    this.#written.set(read.providerEventId, record);
    this.#writtenFingerprints.set(read.providerEventId, fingerprintOf(read));
  }
}

function seriesProviderId(read: ProviderEventRead): string {
  if (read.kind === "event" && read.recurrence.kind === "instance") {
    return read.recurrence.seriesProviderId;
  }
  if (read.kind === "cancellation" && read.series) {
    return read.series.seriesProviderId;
  }
  return "";
}

function fingerprintOf(read: ProviderEventRead): string {
  if (read.kind === "cancellation") return `${read.providerVersion}\0`;
  return `${read.providerVersion}\0${read.providerUpdatedAt ?? ""}`;
}
