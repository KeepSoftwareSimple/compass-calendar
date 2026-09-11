import { faker } from "@faker-js/faker";
import { type Db } from "mongodb";
import {
  type CalendarId,
  type DateOnly,
  type DateTime,
  type EventId,
  type TimeZone,
} from "@core/types/domain-primitives";
import { type ProviderEventVersion } from "@core/types/sync/event.contracts";
import {
  type ConnectionId,
  type PrincipalId,
  type ProviderEventId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import {
  EventRepository,
  type ProviderEventUpsert,
} from "@sync/storage/repositories/event.repository";

const objectId = () => faker.database.mongodbObjectId();

const timed = (start: string, end: string, timeZone = "America/Denver") => ({
  kind: "timed" as const,
  start: start as DateTime,
  end: end as DateTime,
  timeZone: timeZone as TimeZone,
});

const baseContent = {
  title: "Standup",
  description: "",
  location: null,
  organizer: null,
  attendees: [],
  conference: null,
};

const linkedUpsert = (
  overrides: Partial<ProviderEventUpsert> = {},
): ProviderEventUpsert =>
  ({
    tenantId: objectId() as TenantId,
    principalId: objectId() as PrincipalId,
    origin: "provider",
    calendarId: objectId() as CalendarId,
    clientEventId: null,
    connectionId: objectId() as ConnectionId,
    providerEventId: "evt-1" as ProviderEventId,
    providerVersion: "etag-1" as ProviderEventVersion,
    providerUpdatedAt: new Date("2026-07-20T12:00:00.000Z"),
    deliveryState: "confirmed",
    providerMetadata: null,
    content: baseContent,
    schedule: timed("2026-07-14T09:00:00-06:00", "2026-07-14T10:00:00-06:00"),
    recurrence: { kind: "single" },
    lifecycleState: "active",
    generation: 0,
    confirmedAt: new Date("2026-07-20T12:00:00.000Z"),
    ...overrides,
  }) as ProviderEventUpsert;

const compassRecord = (overrides: Partial<EventRecord> = {}): EventRecord =>
  ({
    _id: objectId() as EventId,
    tenantId: objectId() as TenantId,
    principalId: objectId() as PrincipalId,
    origin: "compass",
    calendarId: objectId() as CalendarId,
    clientEventId: null,
    connectionId: null,
    providerEventId: null,
    providerVersion: null,
    providerUpdatedAt: null,
    deliveryState: null,
    providerMetadata: null,
    content: baseContent,
    schedule: timed("2026-07-14T09:00:00-06:00", "2026-07-14T10:00:00-06:00"),
    recurrence: { kind: "single" },
    lifecycleState: "active",
    generation: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    confirmedAt: null,
    ...overrides,
  }) as EventRecord;

describe("EventRepository", () => {
  const storage = setupSyncStorage(import.meta.url);
  let db: Db;
  let repo: EventRepository;

  beforeEach(() => {
    db = storage.db();
    repo = new EventRepository(db);
  });

  it("dedupes a linked event on provider identity across repeated reads", async () => {
    const identity = {
      connectionId: objectId() as ConnectionId,
      calendarId: objectId() as CalendarId,
      providerEventId: "evt-42" as ProviderEventId,
    };
    const first = await repo.upsertByProviderIdentity(
      linkedUpsert({
        ...identity,
        providerVersion: "etag-1" as ProviderEventVersion,
      }),
    );
    const second = await repo.upsertByProviderIdentity(
      linkedUpsert({
        ...identity,
        providerVersion: "etag-2" as ProviderEventVersion,
      }),
    );
    expect(second._id).toBe(first._id);
    expect(second.providerVersion).toBe("etag-2" as ProviderEventVersion);
    expect(await db.collection("events").countDocuments()).toBe(1);
  });

  it("preserves iCalUID atomically when a sparse upsert omits it", async () => {
    const identity = {
      connectionId: objectId() as ConnectionId,
      calendarId: objectId() as CalendarId,
      providerEventId: "evt-uid" as ProviderEventId,
    };
    const first = await repo.upsertByProviderIdentity(
      linkedUpsert({
        ...identity,
        providerMetadata: { iCalUID: "kept@google.com" },
      }),
      { preserveIcalUidWhenAbsent: true },
    );
    expect(first.providerMetadata).toEqual({ iCalUID: "kept@google.com" });

    const second = await repo.upsertByProviderIdentity(
      linkedUpsert({
        ...identity,
        providerVersion: "etag-2" as ProviderEventVersion,
        providerMetadata: null,
      }),
      { preserveIcalUidWhenAbsent: true },
    );
    expect(second._id).toBe(first._id);
    expect(second.providerVersion).toBe("etag-2" as ProviderEventVersion);
    expect(second.providerMetadata).toEqual({ iCalUID: "kept@google.com" });
  });

  it("clears providerMetadata when preserve is off", async () => {
    const identity = {
      connectionId: objectId() as ConnectionId,
      calendarId: objectId() as CalendarId,
      providerEventId: "evt-clear" as ProviderEventId,
    };
    await repo.upsertByProviderIdentity(
      linkedUpsert({
        ...identity,
        providerMetadata: { iCalUID: "gone@google.com" },
      }),
    );
    const cleared = await repo.upsertByProviderIdentity(
      linkedUpsert({ ...identity, providerMetadata: null }),
    );
    expect(cleared.providerMetadata).toBeNull();
  });

  // The $type in the upsert filter looks redundant (the input is always a
  // string) but is what lets the planner use the provider_event_identity
  // PARTIAL index — without it every upsert COLLSCANs, which took prod down.
  // This pins the plan so a cleanup can't silently strip the operator.
  // See the PLANNER TRAP note in index-manifest.ts.
  it("provider-identity filter is served by the partial index, not a scan", async () => {
    const identity = {
      connectionId: objectId() as ConnectionId,
      calendarId: objectId() as CalendarId,
      providerEventId: "evt-plan" as ProviderEventId,
    };
    await repo.upsertByProviderIdentity(linkedUpsert(identity));

    const plan = await db
      .collection("events")
      .find({
        connectionId: identity.connectionId,
        calendarId: identity.calendarId,
        providerEventId: { $eq: identity.providerEventId, $type: "string" },
      })
      .explain("queryPlanner");
    const winning = JSON.stringify(plan);
    expect(winning).toContain("provider_event_identity");
    expect(winning).not.toContain("COLLSCAN");
  });

  it("stores many unlinked Compass events (no provider identity collision)", async () => {
    const principalId = objectId() as PrincipalId;
    await repo.put(compassRecord({ principalId }));
    await repo.put(compassRecord({ principalId }));
    expect(await db.collection("events").countDocuments()).toBe(2);
  });

  it("round-trips an all-day event", async () => {
    const record = compassRecord({
      schedule: {
        kind: "allDay",
        start: "2026-07-14" as DateOnly,
        end: "2026-07-15" as DateOnly,
      },
    });
    const saved = await repo.put(record);
    const read = await repo.findById(
      saved.tenantId,
      saved.principalId,
      saved._id,
    );
    expect(read?.schedule).toEqual({
      kind: "allDay",
      start: "2026-07-14" as DateOnly,
      end: "2026-07-15" as DateOnly,
    });
  });

  it("round-trips a DST-crossing timed schedule", async () => {
    const dst = timed("2026-03-08T01:30:00-07:00", "2026-03-08T03:30:00-06:00");
    const saved = await repo.put(compassRecord({ schedule: dst }));
    const read = await repo.findById(
      saved.tenantId,
      saved.principalId,
      saved._id,
    );
    expect<unknown>(read?.schedule).toEqual(dst);
  });

  it("round-trips a recurrence exception event", async () => {
    const seriesId = objectId() as EventId;
    const record = compassRecord({
      recurrence: {
        kind: "exception",
        seriesId: seriesId as EventRecord["_id"],
        recurrenceId: "2026-07-21T09:00:00.000Z" as never,
        cancelled: true,
      },
    });
    const saved = await repo.put(record);
    const read = await repo.findById(
      saved.tenantId,
      saved.principalId,
      saved._id,
    );
    expect(read?.recurrence).toMatchObject({
      kind: "exception",
      cancelled: true,
    });
  });

  it("scopes findById to the owning principal", async () => {
    const saved = await repo.put(compassRecord());
    const other = objectId() as EventRecord["principalId"];
    expect(await repo.findById(saved.tenantId, other, saved._id)).toBeNull();
    expect(
      await repo.findById(saved.tenantId, saved.principalId, saved._id),
    ).not.toBeNull();
  });

  describe("findByIds", () => {
    it("batch-hydrates several events by id, owner-scoped", async () => {
      const tenantId = objectId() as EventRecord["tenantId"];
      const principalId = objectId() as EventRecord["principalId"];
      const a = await repo.put(compassRecord({ tenantId, principalId }));
      const b = await repo.put(compassRecord({ tenantId, principalId }));

      const found = await repo.findByIds(tenantId, principalId, [a._id, b._id]);

      expect(found.map((e) => e._id).sort()).toEqual([a._id, b._id].sort());
    });

    it("excludes ids owned by a different principal", async () => {
      const tenantId = objectId() as EventRecord["tenantId"];
      const mine = objectId() as EventRecord["principalId"];
      const theirs = objectId() as EventRecord["principalId"];
      const own = await repo.put(
        compassRecord({ tenantId, principalId: mine as PrincipalId }),
      );
      const foreign = await repo.put(
        compassRecord({ tenantId, principalId: theirs as PrincipalId }),
      );

      const found = await repo.findByIds(tenantId, mine, [
        own._id,
        foreign._id,
      ]);

      expect(found.map((e) => e._id)).toEqual([own._id]);
    });

    it("returns an empty array for an empty id list without querying", async () => {
      const tenantId = objectId() as EventRecord["tenantId"];
      const principalId = objectId() as EventRecord["principalId"];
      expect(await repo.findByIds(tenantId, principalId, [])).toEqual([]);
    });

    it("silently omits ids that do not exist", async () => {
      const saved = await repo.put(compassRecord());
      const missing = objectId() as EventRecord["_id"];

      const found = await repo.findByIds(saved.tenantId, saved.principalId, [
        saved._id,
        missing,
      ]);

      expect(found.map((e) => e._id)).toEqual([saved._id]);
    });
  });

  it("deleteById removes only the owner's event and is idempotent", async () => {
    const saved = await repo.put(compassRecord());
    const other = objectId() as EventRecord["principalId"];
    // A foreign principal cannot delete it.
    expect(await repo.deleteById(saved.tenantId, other, saved._id)).toBe(false);
    expect(
      await repo.findById(saved.tenantId, saved.principalId, saved._id),
    ).not.toBeNull();
    // The owner deletes it; a repeated delete is a no-op.
    expect(
      await repo.deleteById(saved.tenantId, saved.principalId, saved._id),
    ).toBe(true);
    expect(
      await repo.deleteById(saved.tenantId, saved.principalId, saved._id),
    ).toBe(false);
  });

  it("replaceExisting updates a present event but never resurrects an absent one", async () => {
    const record = compassRecord();
    // No document exists yet: a conditional replace must not insert one.
    expect(await repo.replaceExisting(record)).toBe(false);
    expect(
      await repo.findById(record.tenantId, record.principalId, record._id),
    ).toBeNull();
    // Once it exists, the replace matches and updates it.
    await repo.put(record);
    const updated = {
      ...record,
      content: { ...record.content, title: "Changed" },
    };
    expect(await repo.replaceExisting(updated)).toBe(true);
    const read = await repo.findById(
      record.tenantId,
      record.principalId,
      record._id,
    );
    expect(read?.content.title).toBe("Changed");
  });

  it("leaves existing customizations untouched on upsertByProviderIdentity", async () => {
    const identity = {
      connectionId: objectId() as ConnectionId,
      calendarId: objectId() as CalendarId,
      providerEventId: "evt-custom" as ProviderEventId,
    };
    const first = await repo.upsertByProviderIdentity(
      linkedUpsert({
        ...identity,
        customizations: { title: "My title" },
      }),
    );
    expect(first.customizations).toEqual({ title: "My title" });

    const second = await repo.upsertByProviderIdentity(
      linkedUpsert({
        ...identity,
        providerVersion: "etag-2" as ProviderEventVersion,
        content: { ...baseContent, title: "Provider title" },
      }),
    );
    expect(second._id).toBe(first._id);
    expect(second.customizations).toEqual({ title: "My title" });
  });

  it("preserves customizations on the iCalUID-preserving upsert path", async () => {
    const identity = {
      connectionId: objectId() as ConnectionId,
      calendarId: objectId() as CalendarId,
      providerEventId: "evt-custom-uid" as ProviderEventId,
    };
    const first = await repo.upsertByProviderIdentity(
      linkedUpsert({
        ...identity,
        customizations: { description: "My notes" },
        providerMetadata: { iCalUID: "kept@google.com" },
      }),
      { preserveIcalUidWhenAbsent: true },
    );
    expect(first.customizations).toEqual({ description: "My notes" });

    const second = await repo.upsertByProviderIdentity(
      linkedUpsert({
        ...identity,
        providerVersion: "etag-2" as ProviderEventVersion,
        providerMetadata: null,
      }),
      { preserveIcalUidWhenAbsent: true },
    );
    expect(second.customizations).toEqual({ description: "My notes" });
  });

  it("writes customizations through replaceExisting", async () => {
    const record = compassRecord({
      customizations: { title: "Overlay" },
    });
    await repo.put(record);
    const updated = {
      ...record,
      customizations: { title: "Updated overlay", location: "Room 2" },
    };
    expect(await repo.replaceExisting(updated)).toBe(true);
    const read = await repo.findById(
      record.tenantId,
      record.principalId,
      record._id,
    );
    expect(read?.customizations).toEqual({
      title: "Updated overlay",
      location: "Room 2",
    });
  });

  it("finds only the owner's exceptions of one series", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const seriesId = objectId() as EventId;
    const exception = (
      recurrenceId: string,
      overrides: Partial<EventRecord> = {},
    ) =>
      compassRecord({
        tenantId,
        principalId,
        recurrence: {
          kind: "exception",
          seriesId,
          recurrenceId,
          cancelled: false,
        } as EventRecord["recurrence"],
        ...overrides,
      });

    const mine = await repo.put(exception("2026-07-21T09:00:00-06:00"));
    // Same series, a different instance — also mine (distinct recurrenceId, per
    // the unique series_exception_identity index).
    await repo.put(exception("2026-07-28T09:00:00-06:00"));
    // A different series' exception, a plain single, the master itself, and
    // another principal's exception must all be excluded.
    await repo.put(
      compassRecord({
        tenantId,
        principalId,
        recurrence: {
          kind: "exception",
          seriesId: objectId() as EventId,
          recurrenceId: "2026-07-21T09:00:00-06:00" as DateTime,
          cancelled: false,
        } as EventRecord["recurrence"],
      }),
    );
    await repo.put(compassRecord({ tenantId, principalId }));
    await repo.put(
      compassRecord({
        _id: seriesId,
        tenantId,
        principalId,
        recurrence: {
          kind: "seriesMaster",
          rules: ["RRULE:FREQ=WEEKLY"],
        } as EventRecord["recurrence"],
      }),
    );
    await repo.put(
      exception("2026-07-21T09:00:00-06:00", {
        principalId: objectId() as PrincipalId,
      }),
    );

    const found = await repo.findSeriesExceptions(
      tenantId,
      principalId,
      seriesId,
    );
    expect(found).toHaveLength(2);
    expect(found.every((e) => e.recurrence.kind === "exception")).toBe(true);
    expect(found.some((e) => e._id === mine._id)).toBe(true);
  });

  it("upserts one exception per (series, instant), mirroring the master", async () => {
    const master = await repo.put(
      compassRecord({
        recurrence: {
          kind: "seriesMaster",
          rules: ["RRULE:FREQ=WEEKLY"],
        } as EventRecord["recurrence"],
      }),
    );
    const recurrenceId = "2026-07-21T09:00:00-06:00" as never;
    const override = {
      content: { ...master.content, title: "Overridden" },
      schedule: master.schedule,
      cancelled: false,
    };

    const first = await repo.upsertException(
      master,
      recurrenceId,
      override,
      new Date(),
    );
    // A second upsert for the same instant updates in place — same id, no dupe.
    const second = await repo.upsertException(
      master,
      recurrenceId,
      { ...override, cancelled: true },
      new Date(),
    );

    expect(second._id).toBe(first._id);
    expect(second.tenantId).toBe(master.tenantId);
    expect(second.calendarId).toBe(master.calendarId);
    if (second.recurrence.kind === "exception") {
      expect(second.recurrence.seriesId).toBe(master._id);
      expect(second.recurrence.recurrenceId).toBe(recurrenceId);
      expect(second.recurrence.cancelled).toBe(true);
    }
    const exceptions = await repo.findSeriesExceptions(
      master.tenantId,
      master.principalId,
      master._id,
    );
    expect(exceptions).toHaveLength(1);
  });

  // Regression for PostHog E11000 on provider_event_identity: import stores a
  // Google instance via upsertByProviderIdentity with an offset-form
  // recurrenceId, then a scope-"this" command upserts with the canonical UTC
  // form of the same instant. Without converging on the provider-identity
  // document, the series-keyed insert collides the unique index.
  it("converges upsertException onto an imported provider-identity exception", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const calendarId = objectId() as CalendarId;
    const connectionId = objectId() as ConnectionId;
    const offsetRecurrenceId = "2026-08-10T13:00:00-06:00" as never;
    const utcRecurrenceId = "2026-08-10T19:00:00.000Z" as never;
    const providerEventId = "g-series_20260810T190000Z" as ProviderEventId;

    const master = await repo.put(
      compassRecord({
        tenantId,
        principalId,
        calendarId,
        connectionId,
        providerEventId: "g-series" as ProviderEventId,
        providerVersion: "etag-master" as ProviderEventVersion,
        origin: "provider",
        recurrence: {
          kind: "seriesMaster",
          rules: ["RRULE:FREQ=WEEKLY"],
        } as EventRecord["recurrence"],
      }),
    );

    const imported = await repo.upsertByProviderIdentity(
      linkedUpsert({
        tenantId,
        principalId,
        calendarId,
        connectionId,
        providerEventId,
        providerVersion: "etag-inst" as ProviderEventVersion,
        content: { ...baseContent, title: "Imported override" },
        schedule: timed(
          "2026-08-10T14:00:00-06:00",
          "2026-08-10T15:00:00-06:00",
        ),
        recurrence: {
          kind: "exception",
          seriesId: master._id,
          recurrenceId: offsetRecurrenceId,
          cancelled: false,
        } as EventRecord["recurrence"],
      }),
    );

    const updated = await repo.upsertException(
      master,
      utcRecurrenceId,
      {
        content: { ...baseContent, title: "Command override" },
        schedule: timed(
          "2026-08-10T14:00:00-06:00",
          "2026-08-10T15:00:00-06:00",
        ),
        cancelled: false,
        providerIdentity: {
          providerEventId: providerEventId as never,
          providerVersion: "etag-inst-2" as never,
        },
      },
      new Date(),
    );

    expect(updated._id).toBe(imported._id);
    expect(updated.content.title).toBe("Command override");
    expect(updated.providerEventId).toBe(providerEventId);
    expect(updated.providerVersion).toBe("etag-inst-2" as ProviderEventVersion);
    if (updated.recurrence.kind === "exception") {
      expect(updated.recurrence.seriesId).toBe(master._id);
      expect(updated.recurrence.recurrenceId).toBe(utcRecurrenceId);
    }
    const exceptions = await repo.findSeriesExceptions(
      tenantId,
      principalId,
      master._id,
    );
    expect(exceptions).toHaveLength(1);
  });

  it("drops a series-keyed duplicate when converging on provider identity", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const calendarId = objectId() as CalendarId;
    const connectionId = objectId() as ConnectionId;
    const offsetRecurrenceId = "2026-08-15T14:00:00-06:00" as never;
    const utcRecurrenceId = "2026-08-15T20:00:00.000Z" as never;
    const providerEventId = "g-series_20260815T200000Z" as ProviderEventId;

    const master = await repo.put(
      compassRecord({
        tenantId,
        principalId,
        calendarId,
        connectionId,
        providerEventId: "g-series" as ProviderEventId,
        providerVersion: "etag-master" as ProviderEventVersion,
        origin: "provider",
        recurrence: {
          kind: "seriesMaster",
          rules: ["RRULE:FREQ=WEEKLY"],
        } as EventRecord["recurrence"],
      }),
    );

    // Series-keyed tombstone from a prior command that used the UTC form
    // (instance already gone → null provider identity).
    const tombstone = await repo.upsertException(
      master,
      utcRecurrenceId,
      {
        content: baseContent,
        schedule: timed(
          "2026-08-15T14:00:00-06:00",
          "2026-08-15T15:00:00-06:00",
        ),
        cancelled: true,
        providerIdentity: null,
      },
      new Date(),
    );

    // Import still carries the live provider instance under the offset form.
    const imported = await repo.upsertByProviderIdentity(
      linkedUpsert({
        tenantId,
        principalId,
        calendarId,
        connectionId,
        providerEventId,
        providerVersion: "etag-inst" as ProviderEventVersion,
        content: { ...baseContent, title: "Still at provider" },
        schedule: timed(
          "2026-08-15T14:00:00-06:00",
          "2026-08-15T15:00:00-06:00",
        ),
        recurrence: {
          kind: "exception",
          seriesId: master._id,
          recurrenceId: offsetRecurrenceId,
          cancelled: false,
        } as EventRecord["recurrence"],
      }),
    );
    expect(imported._id).not.toBe(tombstone._id);

    const converged = await repo.upsertException(
      master,
      utcRecurrenceId,
      {
        content: { ...baseContent, title: "Retried delete" },
        schedule: timed(
          "2026-08-15T14:00:00-06:00",
          "2026-08-15T15:00:00-06:00",
        ),
        cancelled: true,
        providerIdentity: {
          providerEventId: providerEventId as never,
          providerVersion: "etag-inst" as never,
        },
      },
      new Date(),
    );

    expect(converged._id).toBe(imported._id);
    expect(converged.content.title).toBe("Retried delete");
    if (converged.recurrence.kind === "exception") {
      expect(converged.recurrence.cancelled).toBe(true);
      expect(converged.recurrence.recurrenceId).toBe(utcRecurrenceId);
    }
    expect(
      await repo.findById(tenantId, principalId, tombstone._id),
    ).toBeNull();
    expect(
      await repo.findSeriesExceptions(tenantId, principalId, master._id),
    ).toHaveLength(1);
  });

  // After recurrenceId canonicalization, import and command share the UTC
  // series_exception_identity key. A null-provider tombstone left by a
  // scope-"this" delete must be adopted by the provider-identity upsert,
  // not collide it.
  it("adopts a series-keyed tombstone when importing a provider exception", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const calendarId = objectId() as CalendarId;
    const connectionId = objectId() as ConnectionId;
    const utcRecurrenceId = "2026-08-10T19:00:00.000Z" as never;
    const providerEventId = "g-series_20260810T190000Z" as ProviderEventId;

    const master = await repo.put(
      compassRecord({
        tenantId,
        principalId,
        calendarId,
        connectionId,
        providerEventId: "g-series" as ProviderEventId,
        providerVersion: "etag-master" as ProviderEventVersion,
        origin: "provider",
        recurrence: {
          kind: "seriesMaster",
          rules: ["RRULE:FREQ=WEEKLY"],
        } as EventRecord["recurrence"],
      }),
    );

    const tombstone = await repo.upsertException(
      master,
      utcRecurrenceId,
      {
        content: baseContent,
        schedule: timed(
          "2026-08-10T13:00:00-06:00",
          "2026-08-10T14:00:00-06:00",
        ),
        cancelled: true,
        providerIdentity: null,
      },
      new Date(),
    );
    expect(tombstone.providerEventId).toBeNull();

    const imported = await repo.upsertByProviderIdentity(
      linkedUpsert({
        tenantId,
        principalId,
        calendarId,
        connectionId,
        providerEventId,
        providerVersion: "etag-inst" as ProviderEventVersion,
        content: { ...baseContent, title: "Cancelled at provider" },
        schedule: timed(
          "2026-08-10T13:00:00-06:00",
          "2026-08-10T14:00:00-06:00",
        ),
        recurrence: {
          kind: "exception",
          seriesId: master._id,
          recurrenceId: utcRecurrenceId,
          cancelled: true,
        } as EventRecord["recurrence"],
      }),
    );

    expect(imported._id).toBe(tombstone._id);
    expect(imported.providerEventId).toBe(providerEventId);
    expect(imported.content.title).toBe("Cancelled at provider");
    expect(
      await repo.findSeriesExceptions(tenantId, principalId, master._id),
    ).toHaveLength(1);
  });
});
