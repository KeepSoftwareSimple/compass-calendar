import { faker } from "@faker-js/faker";
import { type CalendarId } from "@core/types/domain-primitives";
import {
  type ConnectionId,
  type PrincipalId,
  type ProviderCalendarSourceId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { seedProviderCalendar } from "@sync/__tests__/helpers/fixtures";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { backfillCalendarActive } from "@sync/storage/backfill-calendar-active";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";

const objectId = () => faker.database.mongodbObjectId();

describe("backfillCalendarActive", () => {
  const storage = setupSyncStorage(import.meta.url);

  it("stamps calendarActive from the calendar row for resources missing the field", async () => {
    const db = storage.db();
    const calendars = new ProviderCalendarRepository(db);
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const connectionId = objectId() as ConnectionId;
    const activeCalendar = await seedProviderCalendar(calendars, {
      tenantId,
      principalId,
      connectionId,
      active: true,
    });
    const inactiveCalendar = await seedProviderCalendar(calendars, {
      tenantId,
      principalId,
      connectionId,
      providerCalendarId: "hidden@google.com" as ProviderCalendarSourceId,
      primary: false,
      active: false,
    });

    await db.collection(SYNC_COLLECTIONS.syncResources).insertMany([
      {
        _id: objectId(),
        tenantId,
        principalId,
        connectionId,
        resourceKind: "events",
        calendarId: activeCalendar._id,
        syncCursor: null,
        pageCursor: null,
        importGeneration: 0,
        activeGeneration: 0,
        lastAttemptAt: null,
        lastSuccessAt: null,
        bootstrapState: "ready",
        subscriptionId: null,
        subscriptionResourceId: null,
        subscriptionToken: null,
        subscriptionExpiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: objectId(),
        tenantId,
        principalId,
        connectionId,
        resourceKind: "events",
        calendarId: inactiveCalendar._id,
        syncCursor: null,
        pageCursor: null,
        importGeneration: 0,
        activeGeneration: 0,
        lastAttemptAt: null,
        lastSuccessAt: null,
        bootstrapState: "ready",
        subscriptionId: null,
        subscriptionResourceId: null,
        subscriptionToken: null,
        subscriptionExpiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: objectId(),
        tenantId,
        principalId,
        connectionId,
        resourceKind: "events",
        calendarId: objectId() as CalendarId,
        syncCursor: null,
        pageCursor: null,
        importGeneration: 0,
        activeGeneration: 0,
        lastAttemptAt: null,
        lastSuccessAt: null,
        bootstrapState: "ready",
        subscriptionId: null,
        subscriptionResourceId: null,
        subscriptionToken: null,
        subscriptionExpiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ] as never);

    const stamped = await backfillCalendarActive(db);
    expect(stamped).toBe(3);

    const byCalendarId = Object.fromEntries(
      (
        await db
          .collection(SYNC_COLLECTIONS.syncResources)
          .find({ resourceKind: "events" })
          .toArray()
      ).map((row) => [String(row["calendarId"]), row["calendarActive"]]),
    );
    expect(byCalendarId[activeCalendar._id]).toBe(true);
    expect(byCalendarId[inactiveCalendar._id]).toBe(false);
    expect(
      Object.values(byCalendarId).filter((value) => value === false),
    ).toHaveLength(2);

    expect(await backfillCalendarActive(db)).toBe(0);
  });
});
