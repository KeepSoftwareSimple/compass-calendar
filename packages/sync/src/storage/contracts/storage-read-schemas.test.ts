import { deriveDiagnosticKey } from "@sync/safety/diagnostic-key";
import { CommandReadSchema, CommandSubmitSchema } from "./command.contracts";
import {
  CredentialReadSchema,
  OauthRefreshStoredUpsertSchema,
} from "./credential.contracts";
import {
  DeletionMarkerReadSchema,
  DeletionMarkerRecordInputSchema,
} from "./deletion-marker.contracts";
import { EventReadSchema, EventRecordSchema } from "./event.contracts";
import {
  EventOccurrenceReadSchema,
  EventOccurrenceRecordSchema,
} from "./event-occurrence.contracts";
import {
  InvalidationAppendSchema,
  InvalidationReadSchema,
} from "./invalidation.contracts";
import { JobEnqueueSchema, JobReadSchema } from "./job.contracts";
import {
  ProviderCalendarReadSchema,
  ProviderCalendarUpsertSchema,
} from "./provider-calendar.contracts";
import {
  ProviderConnectionReadSchema,
  ProviderConnectionUpsertSchema,
} from "./provider-connection.contracts";
import { describe, expect, it } from "bun:test";

const ID = "507f1f77bcf86cd799439011";
const NOW = new Date("2026-09-21T12:00:00.000Z");
const EXTRA = { fieldFromNewerBuild: "value the old build never heard of" };

const content = {
  title: "Standup",
  description: "",
  location: null,
  organizer: null,
  attendees: [],
  conference: null,
};

const schedule = {
  kind: "timed" as const,
  start: "2026-09-21T12:00:00.000Z",
  end: "2026-09-21T12:30:00.000Z",
  timeZone: "Etc/UTC",
};

const eventRecord = {
  _id: ID,
  tenantId: ID,
  principalId: ID,
  origin: "compass",
  calendarId: ID,
  clientEventId: null,
  connectionId: null,
  providerEventId: null,
  providerVersion: null,
  providerUpdatedAt: null,
  deliveryState: null,
  providerMetadata: null,
  content,
  schedule,
  recurrence: { kind: "single" },
  lifecycleState: "active",
  generation: 0,
  createdAt: NOW,
  updatedAt: NOW,
  confirmedAt: null,
};

function expectReadStripsWriteRejects(
  name: string,
  input: {
    read: { parse: (value: unknown) => unknown };
    write: { safeParse: (value: unknown) => { success: boolean } };
    record: Record<string, unknown>;
    upsert?: Record<string, unknown>;
  },
) {
  describe(name, () => {
    it("accepts a field a newer build stamped, so an old build survives a rolling deploy", () => {
      const parsed = input.read.parse({ ...input.record, ...EXTRA }) as Record<
        string,
        unknown
      >;
      expect("fieldFromNewerBuild" in parsed).toBe(false);
    });

    it("still rejects an unknown key on upsert, so this build cannot persist a typo", () => {
      const result = input.write.safeParse({
        ...(input.upsert ?? input.record),
        typoedKey: 1,
      });
      expect(result.success).toBe(false);
    });
  });
}

expectReadStripsWriteRejects("CommandReadSchema", {
  read: CommandReadSchema,
  write: CommandSubmitSchema,
  record: {
    _id: ID,
    tenantId: ID,
    principalId: ID,
    idempotencyKey: "idem-1",
    eventId: ID,
    input: { kind: "delete", invitation: "none", scope: "all" },
    expectedVersion: null,
    outcome: { state: "pending" },
    attemptCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  upsert: {
    tenantId: ID,
    principalId: ID,
    idempotencyKey: "idem-1",
    eventId: ID,
    input: { kind: "delete", invitation: "none", scope: "all" },
    expectedVersion: null,
  },
});

expectReadStripsWriteRejects("CredentialReadSchema", {
  read: CredentialReadSchema,
  write: OauthRefreshStoredUpsertSchema,
  record: {
    credentialKind: "oauthRefresh",
    _id: ID,
    provider: "google",
    refreshTokenCiphertext: "cipher",
    refreshTokenIv: "iv",
    refreshTokenTag: "tag",
    keyVersion: 1,
    accessToken: null,
    accessTokenExpiresAt: null,
    refreshFailureCount: 0,
    scopes: [],
    createdAt: NOW,
    updatedAt: NOW,
  },
  upsert: {
    connectionId: ID,
    provider: "google",
    refreshTokenCiphertext: "cipher",
    refreshTokenIv: "iv",
    refreshTokenTag: "tag",
    keyVersion: 1,
    scopes: [],
  },
});

expectReadStripsWriteRejects("DeletionMarkerReadSchema", {
  read: DeletionMarkerReadSchema,
  write: DeletionMarkerRecordInputSchema,
  record: {
    _id: ID,
    tenantId: ID,
    principalId: ID,
    connectionId: ID,
    calendarId: ID,
    providerEventId: "evt-1",
    providerVersion: "etag-1",
    deletionSource: "compass",
    deletedAt: NOW,
    expiresAt: NOW,
  },
  upsert: {
    tenantId: ID,
    principalId: ID,
    connectionId: ID,
    calendarId: ID,
    providerEventId: "evt-1",
    providerVersion: "etag-1",
    deletionSource: "compass",
    deletedAt: NOW,
  },
});

expectReadStripsWriteRejects("EventOccurrenceReadSchema", {
  read: EventOccurrenceReadSchema,
  write: EventOccurrenceRecordSchema,
  record: {
    _id: ID,
    tenantId: ID,
    principalId: ID,
    eventId: ID,
    occurrenceKey: "2026-09-21T12:00:00.000Z",
    calendarId: ID,
    schedule,
    startAt: NOW,
    endAt: new Date("2026-09-21T12:30:00.000Z"),
    busy: true,
    title: "Standup",
    cancelled: false,
    generation: 0,
  },
});

expectReadStripsWriteRejects("EventReadSchema", {
  read: EventReadSchema,
  write: EventRecordSchema,
  record: eventRecord,
});

describe("EventReadSchema nested customizations", () => {
  it("strips an unknown key inside customizations", () => {
    const parsed = EventReadSchema.parse({
      ...eventRecord,
      customizations: {
        title: "Overlay",
        fieldFromNewerBuild: "nested",
      },
    });
    expect(parsed.customizations).toEqual({ title: "Overlay" });
  });
});

expectReadStripsWriteRejects("InvalidationReadSchema", {
  read: InvalidationReadSchema,
  write: InvalidationAppendSchema,
  record: {
    _id: ID,
    tenantId: ID,
    principalId: ID,
    invalidation: { kind: "connection", connectionId: ID },
    emittedAt: NOW,
    expiresAt: NOW,
  },
  upsert: {
    tenantId: ID,
    principalId: ID,
    invalidation: { kind: "connection", connectionId: ID },
    emittedAt: NOW,
  },
});

expectReadStripsWriteRejects("JobReadSchema", {
  read: JobReadSchema,
  write: JobEnqueueSchema,
  record: {
    _id: ID,
    tenantId: ID,
    principalId: ID,
    connectionId: ID,
    resourceId: null,
    commandId: null,
    kind: "calendarListSync",
    priority: 0,
    state: "pending",
    runAfter: NOW,
    attempt: 0,
    coalescingKey: `calendarListSync:${ID}`,
    leaseOwner: null,
    leaseExpiresAt: null,
    failureClass: null,
    requeuedCount: 0,
    lastError: null,
    lastErrorAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  },
  upsert: {
    tenantId: ID,
    principalId: ID,
    connectionId: ID,
    resourceId: null,
    commandId: null,
    kind: "calendarListSync",
    priority: 0,
    runAfter: NOW,
    coalescingKey: `calendarListSync:${ID}`,
  },
});

expectReadStripsWriteRejects("ProviderCalendarReadSchema", {
  read: ProviderCalendarReadSchema,
  write: ProviderCalendarUpsertSchema,
  record: {
    _id: ID,
    tenantId: ID,
    principalId: ID,
    connectionId: ID,
    providerCalendarId: "primary",
    displayName: "Work",
    color: "#4285f4",
    eventLabels: [],
    active: true,
    primary: true,
    accessRole: "owner",
    capabilities: {
      canReadEvents: true,
      canWriteEvents: true,
      canReadBusy: true,
      canInviteAttendees: true,
    },
    createsGoogleMeet: true,
    createdAt: NOW,
    updatedAt: NOW,
  },
  upsert: {
    tenantId: ID,
    principalId: ID,
    connectionId: ID,
    providerCalendarId: "primary",
    displayName: "Work",
    color: "#4285f4",
    eventLabels: [],
    active: true,
    primary: true,
    accessRole: "owner",
    capabilities: {
      canReadEvents: true,
      canWriteEvents: true,
      canReadBusy: true,
      canInviteAttendees: true,
    },
    createsGoogleMeet: true,
  },
});

expectReadStripsWriteRejects("ProviderConnectionReadSchema", {
  read: ProviderConnectionReadSchema,
  write: ProviderConnectionUpsertSchema,
  record: {
    _id: ID,
    tenantId: ID,
    principalId: ID,
    provider: "google",
    account: {
      providerAccountId: "acct-1",
      email: "user@example.com",
      displayName: null,
    },
    capabilities: ["readEvents"],
    state: "healthy",
    stateReason: null,
    diagnosticKey: deriveDiagnosticKey(ID),
    disconnectedAt: null,
    lastSyncedAt: null,
    lastHealthyAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  },
  upsert: {
    tenantId: ID,
    principalId: ID,
    provider: "google",
    account: {
      providerAccountId: "acct-1",
      email: "user@example.com",
      displayName: null,
    },
    capabilities: ["readEvents"],
    state: "healthy",
    stateReason: null,
  },
});
