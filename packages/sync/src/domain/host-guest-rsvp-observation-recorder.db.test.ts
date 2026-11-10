import { faker } from "@faker-js/faker";
import { type EventId } from "@core/types/domain-primitives";
import {
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { recordHostGuestRsvpObservations } from "@sync/domain/host-guest-rsvp-observation-recorder";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { HostGuestRsvpObservationRepository } from "@sync/storage/repositories/host-guest-rsvp-observation.repository";
import { beforeEach, describe, expect, it } from "bun:test";

const objectId = () => faker.database.mongodbObjectId();

const timed = (start: string, end: string) => ({
  kind: "timed" as const,
  start,
  end,
  timeZone: "UTC" as const,
});

const eventRecord = (
  attendees: EventRecord["content"]["attendees"],
  overrides: Partial<EventRecord> = {},
): EventRecord =>
  ({
    _id: objectId() as EventId,
    tenantId: objectId() as TenantId,
    principalId: objectId() as PrincipalId,
    origin: "provider",
    calendarId: objectId(),
    clientEventId: null,
    connectionId: objectId(),
    providerEventId: "evt-1",
    providerVersion: "1",
    providerUpdatedAt: new Date(),
    deliveryState: "confirmed",
    providerMetadata: null,
    content: {
      title: "1:1",
      description: "",
      location: null,
      organizer: { email: "host@example.com" },
      attendees,
      conference: null,
    },
    schedule: timed("2026-11-23T18:00:00.000Z", "2026-11-23T18:30:00.000Z"),
    recurrence: { kind: "single" },
    lifecycleState: "active",
    generation: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    confirmedAt: new Date(),
    ...overrides,
  }) as EventRecord;

describe("recordHostGuestRsvpObservations", () => {
  const storage = setupSyncStorage(import.meta.url);
  let repo: HostGuestRsvpObservationRepository;
  const principalId = objectId() as PrincipalId;
  const tenantId = objectId() as TenantId;
  const eventId = objectId() as EventId;

  beforeEach(() => {
    repo = new HostGuestRsvpObservationRepository(storage.db());
  });

  const hostAttendee = {
    email: "host@example.com",
    displayName: "Host",
    responseStatus: "accepted" as const,
  };
  const guestNeedsAction = {
    email: "jen@example.com",
    displayName: "Jen",
    responseStatus: "needsAction" as const,
  };
  const guestAccepted = {
    ...guestNeedsAction,
    responseStatus: "accepted" as const,
  };
  const guestDeclined = {
    ...guestNeedsAction,
    responseStatus: "declined" as const,
  };

  it("records an accept on upsert pairs", async () => {
    const observedAt = new Date("2026-11-08T15:00:00.000Z");
    const before = eventRecord([hostAttendee, guestNeedsAction], {
      _id: eventId,
      tenantId,
      principalId,
    });
    const after = eventRecord([hostAttendee, guestAccepted], {
      _id: eventId,
      tenantId,
      principalId,
    });

    await recordHostGuestRsvpObservations(
      repo,
      "host@example.com",
      [{ before, after }],
      observedAt,
    );

    const summary = await repo.summarizeSince(principalId, {
      firstObservedAt: new Date(0),
    });
    expect(summary.count).toBe(1);
    expect(summary.latest?.responseStatus).toBe("accepted");
  });

  it("records a new row when a guest flaps to declined", async () => {
    const observedAt = new Date("2026-11-08T16:00:00.000Z");
    const eventBase = { _id: eventId, tenantId, principalId };
    const beforeAccept = eventRecord([hostAttendee, guestAccepted], eventBase);
    const afterDecline = eventRecord([hostAttendee, guestDeclined], eventBase);

    await recordHostGuestRsvpObservations(
      repo,
      "host@example.com",
      [{ before: beforeAccept, after: afterDecline }],
      observedAt,
    );

    const summary = await repo.summarizeSince(principalId, {
      firstObservedAt: new Date(0),
    });
    expect(summary.count).toBe(1);
    expect(summary.latest?.responseStatus).toBe("declined");
  });

  it("records accept again after the guest re-enters the event", async () => {
    const observedAt = new Date("2026-11-08T17:00:00.000Z");
    const eventBase = { _id: eventId, tenantId, principalId };
    const before = eventRecord([hostAttendee], eventBase);
    const after = eventRecord([hostAttendee, guestAccepted], eventBase);

    await recordHostGuestRsvpObservations(
      repo,
      "host@example.com",
      [{ before, after }],
      observedAt,
    );

    const summary = await repo.summarizeSince(principalId, {
      firstObservedAt: new Date(0),
    });
    expect(summary.count).toBe(1);
  });
});
