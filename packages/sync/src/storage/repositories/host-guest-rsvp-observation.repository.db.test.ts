import { faker } from "@faker-js/faker";
import {
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import {
  HOST_GUEST_RSVP_OBSERVATION_RETENTION_MS,
  HostGuestRsvpObservationRepository,
} from "@sync/storage/repositories/host-guest-rsvp-observation.repository";
import { beforeEach, describe, expect, it } from "bun:test";

describe("HostGuestRsvpObservationRepository", () => {
  const storage = setupSyncStorage(import.meta.url);
  let repo: HostGuestRsvpObservationRepository;
  const principalId = faker.database.mongodbObjectId() as PrincipalId;
  const tenantId = faker.database.mongodbObjectId() as TenantId;

  beforeEach(() => {
    repo = new HostGuestRsvpObservationRepository(storage.db());
  });

  it("summarizes observations after the notice cursor", async () => {
    const observedAt = new Date("2026-11-08T15:00:00.000Z");
    await repo.recordReplies([
      {
        tenantId,
        principalId,
        eventId: faker.database.mongodbObjectId(),
        firstObservedAt: observedAt,
        reply: {
          guestEmailLower: "jen@example.com",
          guestName: "Jen",
          status: "accepted",
          slotStart: "2026-11-23T18:00:00.000Z",
        },
      },
    ]);

    const beforeClaim = await repo.summarizeSince(principalId, {
      firstObservedAt: new Date("2026-11-01T00:00:00.000Z"),
    });
    expect(beforeClaim.count).toBe(1);
    expect(beforeClaim.latest?.guestName).toBe("Jen");

    const stampedId = beforeClaim.latest!._id;
    const afterClaim = await repo.summarizeSince(principalId, {
      firstObservedAt: observedAt,
      observationId: stampedId,
    });
    expect(afterClaim.count).toBe(0);
  });

  it("dedupes the same guest reply identity", async () => {
    const eventId = faker.database.mongodbObjectId();
    const insert = {
      tenantId,
      principalId,
      eventId,
      firstObservedAt: new Date(),
      reply: {
        guestEmailLower: "jen@example.com",
        guestName: "Jen",
        status: "accepted" as const,
        slotStart: "2026-11-23T18:00:00.000Z",
      },
    };
    await repo.recordReplies([insert, insert]);
    const summary = await repo.summarizeSince(principalId, {
      firstObservedAt: new Date(0),
    });
    expect(summary.count).toBe(1);
  });

  it("sets expiresAt on insert for TTL retention", async () => {
    const observedAt = new Date("2026-11-08T15:00:00.000Z");
    await repo.recordReplies([
      {
        tenantId,
        principalId,
        eventId: faker.database.mongodbObjectId(),
        firstObservedAt: observedAt,
        reply: {
          guestEmailLower: "jen@example.com",
          guestName: "Jen",
          status: "accepted",
          slotStart: "2026-11-23T18:00:00.000Z",
        },
      },
    ]);
    const summary = await repo.summarizeSince(principalId, {
      firstObservedAt: new Date(0),
    });
    const expiresAt = summary.latest?.expiresAt;
    expect(expiresAt?.getTime()).toBe(
      observedAt.getTime() + HOST_GUEST_RSVP_OBSERVATION_RETENTION_MS,
    );
  });

  it("keeps separate rows per response status when a guest flaps", async () => {
    const eventId = faker.database.mongodbObjectId();
    const base = {
      tenantId,
      principalId,
      eventId,
      reply: {
        guestEmailLower: "jen@example.com",
        guestName: "Jen",
        slotStart: "2026-11-23T18:00:00.000Z",
      },
    };
    await repo.recordReplies([
      {
        ...base,
        firstObservedAt: new Date("2026-11-08T10:00:00.000Z"),
        reply: { ...base.reply, status: "accepted" },
      },
      {
        ...base,
        firstObservedAt: new Date("2026-11-08T11:00:00.000Z"),
        reply: { ...base.reply, status: "declined" },
      },
    ]);
    const summary = await repo.summarizeSince(principalId, {
      firstObservedAt: new Date(0),
    });
    expect(summary.count).toBe(2);
  });
});
