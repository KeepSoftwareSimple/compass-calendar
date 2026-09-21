import { faker } from "@faker-js/faker";
import { ContactSuggestionsResponseSchema } from "@core/types/contact.contracts";
import {
  BusyAvailabilityRequestSchema,
  BusyAvailabilityResponseSchema,
} from "@core/types/sync/availability.contracts";
import {
  ChangeFeedResponseSchema,
  ChangeFeedResumeQuerySchema,
  GlobalChangeFeedResponseSchema,
} from "@core/types/sync/change-feed.contracts";
import {
  CommandSubmitRequestSchema,
  CommandSubmitResponseSchema,
} from "@core/types/sync/command.contracts";
import {
  CalendarListQuerySchema,
  ConnectionBeginRequestSchema,
  ConnectionBeginResponseSchema,
  ConnectionCredentialRequestSchema,
  ConnectionCredentialResponseSchema,
  ConnectionListResponseSchema,
  ConnectionRefreshResponseSchema,
  GoogleConnectionAdoptionRequestSchema,
  GoogleConnectionAdoptionResponseSchema,
  SyncCalendarListResponseSchema,
} from "@core/types/sync/connection.contracts";
import { DiagnosticConnectionResponseSchema } from "@core/types/sync/diagnostic.contracts";
import {
  EventInstanceListQuerySchema,
  EventInstanceListResponseSchema,
} from "@core/types/sync/event.contracts";
import { SyncHealthSnapshotSchema } from "@core/types/sync/health.contracts";
import { PrincipalPurgeResponseSchema } from "@core/types/sync/principal.contracts";
import { describe, expect, it } from "bun:test";

const objectId = () => faker.database.mongodbObjectId();
const EXTRA = { fieldFromNewerBuild: "value the old build never heard of" };

function withNestedExtra(
  body: Record<string, unknown>,
  nestedPath: string,
): Record<string, unknown> {
  const current = body[nestedPath];
  if (Array.isArray(current) && current[0] && typeof current[0] === "object") {
    return {
      ...body,
      [nestedPath]: [
        { ...(current[0] as object), ...EXTRA },
        ...current.slice(1),
      ],
    };
  }
  if (current && typeof current === "object") {
    return {
      ...body,
      [nestedPath]: { ...(current as object), ...EXTRA },
    };
  }
  throw new Error(`${nestedPath} is not a nested object`);
}

function expectResponseStripsRequestRejects(input: {
  name: string;
  response: { parse: (value: unknown) => unknown };
  responseBody: Record<string, unknown>;
  nestedPath?: string;
  request?: { safeParse: (value: unknown) => { success: boolean } };
  requestBody?: Record<string, unknown>;
}) {
  describe(input.name, () => {
    it("accepts an extra key at the top level so a rolling deploy cannot 502", () => {
      const parsed = input.response.parse({
        ...input.responseBody,
        ...EXTRA,
      }) as Record<string, unknown>;
      expect("fieldFromNewerBuild" in parsed).toBe(false);
    });

    if (input.nestedPath) {
      it("accepts an extra key inside a nested instance", () => {
        const parsed = input.response.parse(
          withNestedExtra(input.responseBody, input.nestedPath!),
        ) as Record<string, unknown>;
        const nested = parsed[input.nestedPath!];
        const target = Array.isArray(nested) ? nested[0] : nested;
        expect("fieldFromNewerBuild" in (target as object)).toBe(false);
      });
    }

    if (input.request && input.requestBody) {
      it("still rejects an extra key on the matching request", () => {
        expect(
          input.request?.safeParse({
            ...input.requestBody,
            typoedKey: 1,
          }).success,
        ).toBe(false);
      });
    }
  });
}

const timedSchedule = {
  kind: "timed" as const,
  start: "2026-07-14T09:00:00.000Z",
  end: "2026-07-14T10:00:00.000Z",
  timeZone: "Etc/UTC",
};

const instance = {
  eventId: objectId(),
  calendarId: objectId(),
  content: {
    title: "Standup",
    description: "Daily sync",
    location: null,
    organizer: null,
    attendees: [],
    conference: null,
  },
  schedule: timedSchedule,
  recurrence: { kind: "single" as const },
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const connection = {
  id: objectId(),
  tenantId: objectId(),
  principalId: objectId(),
  provider: "google" as const,
  account: {
    providerAccountId: "acct-1",
    email: "user@example.com",
    displayName: "User",
  },
  capabilities: ["readEvents"],
  state: "healthy" as const,
  stateReason: null,
  lastSyncedAt: "2026-07-20T12:00:00.000Z",
  lastHealthyAt: "2026-07-20T12:00:00.000Z",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-20T12:00:00.000Z",
};

const calendar = {
  id: objectId(),
  tenantId: objectId(),
  principalId: objectId(),
  connectionId: objectId(),
  providerCalendarId: "primary",
  displayName: "Work",
  color: "#4285f4",
  active: true,
  primary: true,
  accessRole: "owner" as const,
  capabilities: {
    canReadEvents: true,
    canWriteEvents: true,
    canReadBusy: true,
    canInviteAttendees: true,
  },
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-20T12:00:00.000Z",
};

const envelope = {
  iv: "aGVsbG8=",
  ciphertext: "Y2lwaGVydGV4dA==",
  authTag: "dGFn",
};

const command = {
  id: objectId(),
  tenantId: objectId(),
  principalId: objectId(),
  idempotencyKey: "idem-1",
  eventId: objectId(),
  input: {
    kind: "create" as const,
    calendarId: objectId(),
    content: {
      title: "Standup",
      description: "Daily sync",
      location: null,
      organizer: null,
      attendees: [],
      conference: null,
    },
    schedule: timedSchedule,
    recurrence: { kind: "single" as const },
  },
  expectedVersion: null,
  outcome: { state: "pending" as const },
  attemptCount: 0,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const healthSnapshot = {
  environment: "test",
  execution: "passive" as const,
  provider: "google" as const,
  service: "compass-sync" as const,
  connections: {
    connecting: 0,
    importing: 1,
    catchingUp: 0,
    healthy: 10,
    delayed: 2,
    actionRequired: 1,
    disconnected: 3,
  },
  jobs: {
    pending: 4,
    claimed: 1,
    failed: 0,
    oldestDueAgeMs: 12_000,
  },
  subscriptions: {
    healthy: 8,
    renewSoon: 1,
    expired: 0,
    missing: 2,
    neverNotified: 3,
  },
  freshness: {
    sampleSize: 9,
    p50Ms: 5_000,
    p95Ms: 20_000,
    p99Ms: 40_000,
    percentOver30s: 11.1,
  },
  computedAt: "2026-07-25T02:00:00.000Z",
  computeMs: 42,
};

const busyInterval = {
  start: "2026-07-14T09:00:00.000Z",
  end: "2026-07-14T10:00:00.000Z",
};

const changeFeedOk = {
  kind: "ok" as const,
  invalidations: [
    {
      invalidation: {
        kind: "event" as const,
        eventId: objectId(),
        calendarId: objectId(),
      },
      emittedAt: "2026-07-20T12:00:00.000Z",
    },
  ],
  nextCursor: "token-2",
};

const diagnostic = {
  diagnosticKey: "a".repeat(32),
  connectionId: objectId(),
  tenantId: objectId(),
  principalId: objectId(),
  provider: "google" as const,
  state: "delayed" as const,
  stateReason: null,
  accountEmail: "user@example.com",
  lastSyncedAt: "2026-07-24T12:00:00.000Z",
  lastHealthyAt: "2026-07-24T11:00:00.000Z",
  disconnectedAt: null,
  calendarCount: 2,
  pendingJobCount: 1,
  failedJobCount: 0,
  exhaustedJobCount: 0,
  pendingCommandCount: 0,
};

expectResponseStripsRequestRejects({
  name: "EventInstanceListResponseSchema",
  response: EventInstanceListResponseSchema,
  responseBody: { instances: [instance], nextCursor: null },
  nestedPath: "instances",
  request: EventInstanceListQuerySchema,
  requestBody: {
    calendarIds: [objectId()],
    start: "2026-07-01T00:00:00.000Z",
    end: "2026-08-01T00:00:00.000Z",
  },
});

expectResponseStripsRequestRejects({
  name: "ConnectionListResponseSchema",
  response: ConnectionListResponseSchema,
  responseBody: { connections: [connection] },
  nestedPath: "connections",
});

expectResponseStripsRequestRejects({
  name: "ConnectionRefreshResponseSchema",
  response: ConnectionRefreshResponseSchema,
  responseBody: { enqueued: 1, inFlight: 0, resources: 1 },
});

expectResponseStripsRequestRejects({
  name: "SyncCalendarListResponseSchema",
  response: SyncCalendarListResponseSchema,
  responseBody: { calendars: [calendar] },
  nestedPath: "calendars",
  request: CalendarListQuerySchema,
  requestBody: { connectionId: objectId() },
});

expectResponseStripsRequestRejects({
  name: "ChangeFeedResponseSchema",
  response: ChangeFeedResponseSchema,
  responseBody: changeFeedOk,
  nestedPath: "invalidations",
  request: ChangeFeedResumeQuerySchema,
  requestBody: { cursor: null },
});

expectResponseStripsRequestRejects({
  name: "GlobalChangeFeedResponseSchema",
  response: GlobalChangeFeedResponseSchema,
  responseBody: {
    kind: "ok",
    invalidations: [
      {
        invalidation: {
          kind: "connection" as const,
          connectionId: objectId(),
        },
        emittedAt: "2026-07-20T12:00:00.000Z",
        tenantId: objectId(),
        principalId: objectId(),
      },
    ],
    nextCursor: "token-2",
  },
  nestedPath: "invalidations",
});

expectResponseStripsRequestRejects({
  name: "BusyAvailabilityResponseSchema",
  response: BusyAvailabilityResponseSchema,
  responseBody: {
    intervals: [busyInterval],
    computedAt: "2026-07-20T12:00:00.000Z",
    connections: [],
    complete: true,
    issues: [],
    bookable: true,
  },
  nestedPath: "intervals",
  request: BusyAvailabilityRequestSchema,
  requestBody: {
    calendarIds: [objectId()],
    start: "2026-07-14T00:00:00.000Z",
    end: "2026-07-15T00:00:00.000Z",
    maxAgeMs: 300_000,
    purpose: "display",
  },
});

expectResponseStripsRequestRejects({
  name: "CommandSubmitResponseSchema",
  response: CommandSubmitResponseSchema,
  responseBody: { command },
  nestedPath: "command",
  request: CommandSubmitRequestSchema,
  requestBody: {
    idempotencyKey: "idem-1",
    eventId: objectId(),
    input: command.input,
    expectedVersion: null,
  },
});

expectResponseStripsRequestRejects({
  name: "ConnectionBeginResponseSchema",
  response: ConnectionBeginResponseSchema,
  responseBody: {
    kind: "redirect",
    authorizationUrl: "https://example.com/oauth",
  },
  request: ConnectionBeginRequestSchema,
  requestBody: {},
});

expectResponseStripsRequestRejects({
  name: "ConnectionCredentialResponseSchema",
  response: ConnectionCredentialResponseSchema,
  responseBody: { connectionId: objectId() },
  request: ConnectionCredentialRequestSchema,
  requestBody: { provider: "apple", envelope },
});

expectResponseStripsRequestRejects({
  name: "GoogleConnectionAdoptionResponseSchema",
  response: GoogleConnectionAdoptionResponseSchema,
  responseBody: {},
  request: GoogleConnectionAdoptionRequestSchema,
  requestBody: {
    account: {
      providerAccountId: "acct-1",
      email: "user@example.com",
      displayName: "User",
    },
    credential: envelope,
    grantedScopes: ["https://www.googleapis.com/auth/calendar.events"],
  },
});

expectResponseStripsRequestRejects({
  name: "ContactSuggestionsResponseSchema",
  response: ContactSuggestionsResponseSchema,
  responseBody: {
    suggestions: [{ email: "ada@example.com", displayName: "Ada" }],
  },
  nestedPath: "suggestions",
});

expectResponseStripsRequestRejects({
  name: "PrincipalPurgeResponseSchema",
  response: PrincipalPurgeResponseSchema,
  responseBody: {
    connections: 1,
    credentials: 1,
    calendars: 2,
    events: 3,
    eventOccurrences: 4,
    syncResources: 2,
    commands: 0,
    jobs: 1,
    deletionMarkers: 0,
    invalidations: 5,
  },
});

expectResponseStripsRequestRejects({
  name: "SyncHealthSnapshotSchema",
  response: SyncHealthSnapshotSchema,
  responseBody: healthSnapshot,
  nestedPath: "connections",
});

expectResponseStripsRequestRejects({
  name: "DiagnosticConnectionResponseSchema",
  response: DiagnosticConnectionResponseSchema,
  responseBody: diagnostic,
});
