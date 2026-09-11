import { faker } from "@faker-js/faker";
import { type Db } from "mongodb";
import {
  type CalendarId,
  type DateTime,
  type EventId,
  type TimeZone,
} from "@core/types/domain-primitives";
import { type ProviderEventVersion } from "@core/types/sync/event.contracts";
import {
  type IdempotencyKey,
  type PrincipalId,
  type ProviderEventId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { type CommandSubmit } from "@sync/storage/contracts/command.contracts";
import { CommandRepository } from "@sync/storage/repositories/command.repository";

const objectId = () => faker.database.mongodbObjectId();

const timed = {
  kind: "timed",
  start: "2026-07-14T09:00:00-06:00" as DateTime,
  end: "2026-07-14T10:00:00-06:00" as DateTime,
  timeZone: "America/Denver" as TimeZone,
};
const content = {
  title: "Standup",
  description: "",
  location: null,
  organizer: null,
  attendees: [],
  conference: null,
};

const submit = (overrides: Partial<CommandSubmit> = {}): CommandSubmit =>
  ({
    tenantId: objectId() as TenantId,
    principalId: objectId() as PrincipalId,
    idempotencyKey: "key-1" as IdempotencyKey,
    eventId: objectId() as EventId,
    input: {
      kind: "create",
      calendarId: objectId() as CalendarId,
      content,
      schedule: timed,
      recurrence: { kind: "single" },
    },
    expectedVersion: null,
    ...overrides,
  }) as CommandSubmit;

describe("CommandRepository", () => {
  const storage = setupSyncStorage(import.meta.url);
  let db: Db;
  let repo: CommandRepository;

  beforeEach(() => {
    db = storage.db();
    repo = new CommandRepository(db);
  });

  it("submits a new command as pending with zero attempts", async () => {
    const { record: command } = await repo.submit(submit());
    expect(command.outcome).toEqual({ state: "pending" });
    expect(command.attemptCount).toBe(0);
    expect(command._id).toMatch(/^[0-9a-f]{24}$/);
  });

  it("returns the existing command for a repeated idempotency key", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const first = await repo.submit(
      submit({
        tenantId,
        principalId,
        idempotencyKey: "dup" as IdempotencyKey,
      }),
    );
    expect(first.inserted).toBe(true);
    // A retried submit must not create a second command or reset progress.
    await repo.updateOutcome(
      tenantId,
      principalId,
      first.record._id,
      { state: "applying" },
      1,
    );
    const second = await repo.submit(
      submit({
        tenantId,
        principalId,
        idempotencyKey: "dup" as IdempotencyKey,
      }),
    );

    expect(second.inserted).toBe(false);
    expect(second.record._id).toBe(first.record._id);
    expect(second.record.outcome).toEqual({ state: "applying" });
    expect(second.record.attemptCount).toBe(1);
    expect(await db.collection("commands").countDocuments()).toBe(1);
  });

  it("transitions outcome through the command lifecycle", async () => {
    const { record: command } = await repo.submit(submit());
    const applying = await repo.updateOutcome(
      command.tenantId,
      command.principalId,
      command._id,
      { state: "applying" },
      1,
    );
    expect(applying?.outcome).toEqual({ state: "applying" });

    const confirmed = await repo.updateOutcome(
      command.tenantId,
      command.principalId,
      command._id,
      {
        state: "confirmed",
        providerEventId: "evt-1" as ProviderEventId,
        providerVersion: "etag-1" as ProviderEventVersion,
      },
      1,
    );
    expect(confirmed?.outcome).toMatchObject({ state: "confirmed" });
  });

  it("rejects an outcome update from another principal", async () => {
    const { record: command } = await repo.submit(submit());
    const result = await repo.updateOutcome(
      command.tenantId,
      objectId() as CommandSubmit["principalId"],
      command._id,
      { state: "applying" },
      1,
    );
    expect(result).toBeNull();
  });

  it("reopens a terminal command to pending, preserving id/key/attemptCount", async () => {
    const { record: command } = await repo.submit(submit());
    const confirmed = await repo.updateOutcome(
      command.tenantId,
      command.principalId,
      command._id,
      {
        state: "confirmed",
        providerEventId: "evt-1" as ProviderEventId,
        providerVersion: "e-1" as ProviderEventVersion,
      },
      2,
    );
    if (!confirmed) throw new Error("expected a confirmed command");

    const reopened = await repo.reopen(
      command.tenantId,
      command.principalId,
      command._id,
      "confirmed",
    );

    expect(reopened?.outcome).toEqual({ state: "pending" });
    expect(reopened?._id).toBe(command._id);
    expect(reopened?.idempotencyKey).toBe(command.idempotencyKey);
    expect(reopened?.attemptCount).toBe(2);
    expect(await db.collection("commands").countDocuments()).toBe(1);
  });

  it("refuses to reopen when the outcome no longer matches the expected state (the concurrent-resubmit race)", async () => {
    const { record: command } = await repo.submit(submit());
    await repo.updateOutcome(
      command.tenantId,
      command.principalId,
      command._id,
      { state: "confirmed", providerEventId: null, providerVersion: null },
      0,
    );

    // A concurrent resubmit already reopened (or re-terminated) it — this
    // caller's stale expectedState no longer matches.
    const result = await repo.reopen(
      command.tenantId,
      command.principalId,
      command._id,
      "failed",
    );

    expect(result).toBeNull();
    const untouched = await repo.findById(
      command.tenantId,
      command.principalId,
      command._id,
    );
    expect(untouched?.outcome).toEqual({
      state: "confirmed",
      providerEventId: null,
      providerVersion: null,
    });
  });

  it("lists only nonterminal commands, oldest first", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const { record: a } = await repo.submit(
      submit({ tenantId, principalId, idempotencyKey: "a" as IdempotencyKey }),
    );
    await repo.submit(
      submit({ tenantId, principalId, idempotencyKey: "b" as IdempotencyKey }),
    );
    // Terminate one; it should drop out of the nonterminal list.
    await repo.updateOutcome(
      tenantId,
      principalId,
      a._id,
      { state: "confirmed", providerEventId: null, providerVersion: null },
      1,
    );

    const pending = await repo.listNonterminal(tenantId, principalId, 100);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.idempotencyKey).toBe("b" as IdempotencyKey);
  });

  it("reports a nonterminal command for an event, and none once it terminates", async () => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const eventId = objectId() as EventId;
    const { record: command } = await repo.submit(
      submit({ tenantId, principalId, eventId }),
    );

    expect(
      await repo.hasNonterminalForEvent(
        tenantId,
        principalId,
        eventId as never,
      ),
    ).toBe(true);
    // A different event has no in-flight command.
    expect(
      await repo.hasNonterminalForEvent(
        tenantId,
        principalId,
        objectId() as never,
      ),
    ).toBe(false);

    await repo.updateOutcome(
      tenantId,
      principalId,
      command._id,
      { state: "confirmed", providerEventId: null, providerVersion: null },
      1,
    );
    // Terminal now — no longer in flight.
    expect(
      await repo.hasNonterminalForEvent(
        tenantId,
        principalId,
        eventId as never,
      ),
    ).toBe(false);
  });

  it("rejects a raw duplicate insert violating the idempotency index", async () => {
    const shared = {
      tenantId: objectId() as TenantId,
      principalId: objectId() as PrincipalId,
      idempotencyKey: "same",
    };
    const collection = db.collection("commands");
    await collection.insertOne({ _id: objectId(), ...shared } as never);
    await expect(
      collection.insertOne({ _id: objectId(), ...shared } as never),
    ).rejects.toThrow();
  });
});
