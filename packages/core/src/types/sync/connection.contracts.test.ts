import { faker } from "@faker-js/faker";
import {
  CalendarAccessRoleSchema,
  CalendarListQuerySchema,
  ConnectionBeginFeaturesSchema,
  ConnectionBeginRequestSchema,
  ConnectionBeginResponseSchema,
  ConnectionCredentialRequestSchema,
  ConnectionCredentialResponseSchema,
  ConnectionCredentialSubmitRequestSchema,
  ConnectionListResponseSchema,
  ConnectionStateSchema,
  GoogleConnectionAdoptionRequestSchema,
  ProviderAccountFactsSchema,
  ProviderCalendarSchema,
  ProviderConnectionAdoptionRequestSchema,
  ProviderConnectionSchema,
  SyncCalendarListResponseSchema,
  toConnectionBeginRedirect,
} from "@core/types/sync/connection.contracts";
import {
  type ConnectionId,
  type PrincipalId,
  type ProviderAccountId,
  type TenantId,
} from "@core/types/sync/identity.contracts";

const objectId = () => faker.database.mongodbObjectId();

const validConnection = () => ({
  id: objectId(),
  tenantId: objectId() as TenantId,
  principalId: objectId() as PrincipalId,
  provider: "google",
  account: {
    providerAccountId: "112233445566778899000" as ProviderAccountId,
    email: "user@gmail.com",
    displayName: "Test User",
  },
  capabilities: ["readEvents", "writeEvents"],
  state: "healthy",
  stateReason: null,
  lastSyncedAt: "2026-07-20T12:00:00.000Z",
  lastHealthyAt: "2026-07-20T12:00:00.000Z",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-20T12:00:00.000Z",
});

const validCalendar = () => ({
  id: objectId(),
  tenantId: objectId() as TenantId,
  principalId: objectId() as PrincipalId,
  connectionId: objectId() as ConnectionId,
  providerCalendarId: "primary",
  displayName: "Personal",
  color: "#9fe1e7",
  active: true,
  primary: true,
  accessRole: "owner",
  capabilities: {
    canReadEvents: true,
    canWriteEvents: true,
    canReadBusy: true,
    canInviteAttendees: true,
  },
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-20T12:00:00.000Z",
});

describe("Sync connection contracts", () => {
  describe("ProviderConnectionSchema", () => {
    it("accepts a healthy connection", () => {
      expect(
        ProviderConnectionSchema.safeParse(validConnection()).success,
      ).toBe(true);
    });

    it.each([
      "connecting",
      "importing",
      "catchingUp",
      "disconnected",
    ] as const)("accepts state %s without a reason", (state) => {
      const connection = { ...validConnection(), state };
      expect(ProviderConnectionSchema.safeParse(connection).success).toBe(true);
    });

    it("accepts delayed with and without a reason", () => {
      const delayed = { ...validConnection(), state: "delayed" };
      expect(ProviderConnectionSchema.safeParse(delayed).success).toBe(true);
      expect(
        ProviderConnectionSchema.safeParse({
          ...delayed,
          stateReason: "workOverdue",
        }).success,
      ).toBe(true);
    });

    it("accepts actionRequired with a reason", () => {
      const connection = {
        ...validConnection(),
        state: "actionRequired",
        stateReason: "authorizationRevoked",
      };
      expect(ProviderConnectionSchema.safeParse(connection).success).toBe(true);
    });

    it("accepts actionRequired with consentRequired", () => {
      const connection = {
        ...validConnection(),
        state: "actionRequired",
        stateReason: "consentRequired",
      };
      expect(ProviderConnectionSchema.safeParse(connection).success).toBe(true);
    });

    it("rejects actionRequired without a reason", () => {
      const connection = { ...validConnection(), state: "actionRequired" };
      expect(ProviderConnectionSchema.safeParse(connection).success).toBe(
        false,
      );
    });

    it.each([
      "connecting",
      "importing",
      "catchingUp",
      "healthy",
      "disconnected",
    ] as const)("rejects a reason on state %s", (state) => {
      const connection = {
        ...validConnection(),
        state,
        stateReason: "workOverdue",
      };
      expect(ProviderConnectionSchema.safeParse(connection).success).toBe(
        false,
      );
    });

    it("accepts null evidence timestamps before first sync", () => {
      const connection = {
        ...validConnection(),
        state: "connecting",
        lastSyncedAt: null,
        lastHealthyAt: null,
      };
      expect(ProviderConnectionSchema.safeParse(connection).success).toBe(true);
    });

    it("rejects unknown fields", () => {
      const connection = { ...validConnection(), accessToken: "leak" };
      expect(ProviderConnectionSchema.safeParse(connection).success).toBe(
        false,
      );
    });

    it("rejects an unknown provider", () => {
      const connection = { ...validConnection(), provider: "caldav" };
      expect(ProviderConnectionSchema.safeParse(connection).success).toBe(
        false,
      );
    });

    it("rejects an unknown state", () => {
      const connection = { ...validConnection(), state: "syncing" };
      expect(ProviderConnectionSchema.safeParse(connection).success).toBe(
        false,
      );
    });

    it("round-trips through JSON unchanged", () => {
      const parsed = ProviderConnectionSchema.parse(validConnection());
      expect(
        ProviderConnectionSchema.parse(JSON.parse(JSON.stringify(parsed))),
      ).toEqual(parsed);
    });
  });

  describe("ConnectionStateSchema", () => {
    it("covers exactly the seven user-facing states", () => {
      expect(ConnectionStateSchema.options).toEqual([
        "connecting",
        "importing",
        "catchingUp",
        "healthy",
        "delayed",
        "actionRequired",
        "disconnected",
      ]);
    });
  });

  describe("ConnectionBeginFeaturesSchema", () => {
    it("accepts the contacts feature and an empty list", () => {
      expect(
        ConnectionBeginFeaturesSchema.safeParse(["contacts"]).success,
      ).toBe(true);
      expect(ConnectionBeginFeaturesSchema.safeParse([]).success).toBe(true);
    });

    it("rejects unknown features and non-array shapes", () => {
      expect(
        ConnectionBeginFeaturesSchema.safeParse(["telepathy"]).success,
      ).toBe(false);
      expect(ConnectionBeginFeaturesSchema.safeParse("contacts").success).toBe(
        false,
      );
    });
  });

  describe("ConnectionBeginRequestSchema", () => {
    it("keeps a legacy body (no features) parsing byte-identically", () => {
      expect(ConnectionBeginRequestSchema.parse({})).toEqual({});
    });

    it("accepts optional features alongside an optional connectionId", () => {
      expect(
        ConnectionBeginRequestSchema.parse({ features: ["contacts"] }),
      ).toEqual({ features: ["contacts"] });
      const withBoth = ConnectionBeginRequestSchema.safeParse({
        connectionId: "507f1f77bcf86cd799439011" as ConnectionId,
        features: ["contacts"],
      });
      expect(withBoth.success).toBe(true);
    });

    it("rejects unknown features in the begin body", () => {
      expect(
        ConnectionBeginRequestSchema.safeParse({ features: ["telepathy"] })
          .success,
      ).toBe(false);
    });

    it("accepts an optional provider, defaulting to omit", () => {
      expect(
        ConnectionBeginRequestSchema.parse({ provider: "google" }),
      ).toEqual({ provider: "google" });
      expect(
        ConnectionBeginRequestSchema.parse({ provider: "microsoft" }),
      ).toEqual({ provider: "microsoft" });
      expect(
        ConnectionBeginRequestSchema.safeParse({ provider: "yahoo" }).success,
      ).toBe(false);
    });
  });

  describe("ConnectionBeginResponseSchema", () => {
    it("accepts the legacy sync-internal redirect body", () => {
      expect(
        ConnectionBeginResponseSchema.parse({
          authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        }),
      ).toEqual({
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      });
    });

    it("accepts a redirect result with kind", () => {
      expect(
        ConnectionBeginResponseSchema.parse({
          kind: "redirect",
          authorizationUrl: "https://login.microsoftonline.com/common/oauth2",
        }),
      ).toEqual({
        kind: "redirect",
        authorizationUrl: "https://login.microsoftonline.com/common/oauth2",
      });
    });

    it("accepts a connected result", () => {
      const connectionId = objectId() as ConnectionId;
      expect(
        ConnectionBeginResponseSchema.parse({
          kind: "connected",
          connectionId,
        }),
      ).toEqual({ kind: "connected", connectionId });
    });

    it("wraps a legacy body as a redirect", () => {
      expect(
        toConnectionBeginRedirect({
          authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        }),
      ).toEqual({
        kind: "redirect",
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      });
    });
  });

  describe("ConnectionCredentialRequestSchema", () => {
    it("accepts an Apple credential envelope", () => {
      expect(
        ConnectionCredentialRequestSchema.safeParse({
          provider: "apple",
          envelope: {
            iv: "aGVsbG8=",
            ciphertext: "Y2lwaGVydGV4dA==",
            authTag: "dGFn",
          },
        }).success,
      ).toBe(true);
    });

    it("accepts a browser credential payload in the submit union", () => {
      expect(
        ConnectionCredentialSubmitRequestSchema.safeParse({
          provider: "apple",
          username: "user@icloud.com",
          secret: "app-specific-password",
        }).success,
      ).toBe(true);
    });

    it("rejects other providers and unknown fields", () => {
      expect(
        ConnectionCredentialRequestSchema.safeParse({
          provider: "google",
          envelope: {
            iv: "aGVsbG8=",
            ciphertext: "Y2lwaGVydGV4dA==",
            authTag: "dGFn",
          },
        }).success,
      ).toBe(false);
      expect(
        ConnectionCredentialRequestSchema.safeParse({
          provider: "apple",
          envelope: {
            iv: "aGVsbG8=",
            ciphertext: "Y2lwaGVydGV4dA==",
            authTag: "dGFn",
          },
          principalId: objectId() as PrincipalId,
        }).success,
      ).toBe(false);
    });
  });

  describe("ConnectionCredentialResponseSchema", () => {
    it("accepts a connection id", () => {
      const connectionId = objectId() as ConnectionId;
      expect(
        ConnectionCredentialResponseSchema.parse({ connectionId }),
      ).toEqual({ connectionId: connectionId });
    });
  });

  describe("ProviderAccountFactsSchema", () => {
    it("accepts null display fields", () => {
      const facts = {
        providerAccountId: "1122334455" as ProviderAccountId,
        email: null,
        displayName: null,
      };
      expect(ProviderAccountFactsSchema.safeParse(facts).success).toBe(true);
    });

    it("rejects unknown fields", () => {
      const facts = {
        providerAccountId: "1122334455" as ProviderAccountId,
        email: null,
        displayName: null,
        refreshToken: "leak",
      };
      expect(ProviderAccountFactsSchema.safeParse(facts).success).toBe(false);
    });
  });

  describe("GoogleConnectionAdoptionRequestSchema", () => {
    it("accepts the trusted server-side authorization handoff", () => {
      expect(
        GoogleConnectionAdoptionRequestSchema.safeParse({
          account: {
            providerAccountId: "1122334455" as ProviderAccountId,
            email: "connected@example.com",
            displayName: "Connected User",
          },
          credential: {
            iv: "aGVsbG8=",
            ciphertext: "Y2lwaGVydGV4dA==",
            authTag: "dGFn",
          },
          grantedScopes: ["https://www.googleapis.com/auth/calendar.readonly"],
        }).success,
      ).toBe(true);
    });

    it("accepts an optional provider", () => {
      expect(
        ProviderConnectionAdoptionRequestSchema.safeParse({
          provider: "microsoft",
          account: {
            providerAccountId: "1122334455" as ProviderAccountId,
            email: "connected@example.com",
            displayName: "Connected User",
          },
          credential: {
            iv: "aGVsbG8=",
            ciphertext: "Y2lwaGVydGV4dA==",
            authTag: "dGFn",
          },
          grantedScopes: ["Calendars.Read"],
        }).success,
      ).toBe(true);
    });

    it("rejects an empty scope set", () => {
      expect(
        GoogleConnectionAdoptionRequestSchema.safeParse({
          account: {
            providerAccountId: "1122334455" as ProviderAccountId,
            email: null,
            displayName: null,
          },
          credential: {
            iv: "aGVsbG8=",
            ciphertext: "Y2lwaGVydGV4dA==",
            authTag: "dGFn",
          },
          grantedScopes: [],
        }).success,
      ).toBe(false);
    });
  });

  describe("ProviderCalendarSchema", () => {
    it("accepts a writable primary calendar", () => {
      expect(ProviderCalendarSchema.safeParse(validCalendar()).success).toBe(
        true,
      );
    });

    // Every capability combination is representable: facts describe what the
    // provider permits, and no combination is privileged.
    it.each(
      Array.from({ length: 16 }, (_, mask) => [
        {
          canReadEvents: Boolean(mask & 1),
          canWriteEvents: Boolean(mask & 2),
          canReadBusy: Boolean(mask & 4),
          canInviteAttendees: Boolean(mask & 8),
        },
      ]),
    )("accepts capability combination %o", (capabilities) => {
      const calendar = { ...validCalendar(), capabilities };
      expect(ProviderCalendarSchema.safeParse(calendar).success).toBe(true);
    });

    it.each([
      "owner",
      "editor",
      "viewer",
      "busyOnly",
    ] as const)("accepts access role %s", (accessRole) => {
      const calendar = { ...validCalendar(), accessRole };
      expect(ProviderCalendarSchema.safeParse(calendar).success).toBe(true);
    });

    it("rejects a provider-specific access role", () => {
      expect(CalendarAccessRoleSchema.safeParse("freeBusyReader").success).toBe(
        false,
      );
    });

    it("accepts an inactive, null-color calendar", () => {
      const calendar = { ...validCalendar(), active: false, color: null };
      expect(ProviderCalendarSchema.safeParse(calendar).success).toBe(true);
    });

    it("defaults createsGoogleMeet to true when omitted", () => {
      const parsed = ProviderCalendarSchema.parse(validCalendar());
      expect(parsed.createsGoogleMeet).toBe(true);
      expect(
        ProviderCalendarSchema.parse({
          ...validCalendar(),
          createsGoogleMeet: false,
        }).createsGoogleMeet,
      ).toBe(false);
    });

    it("rejects product preference fields", () => {
      const calendar = { ...validCalendar(), visible: true };
      expect(ProviderCalendarSchema.safeParse(calendar).success).toBe(false);
    });

    it("rejects a missing capability field", () => {
      const { canReadBusy: _dropped, ...partial } =
        validCalendar().capabilities;
      const calendar = { ...validCalendar(), capabilities: partial };
      expect(ProviderCalendarSchema.safeParse(calendar).success).toBe(false);
    });
  });

  describe("list and query contracts", () => {
    it("accepts a connection list", () => {
      const response = { connections: [validConnection()] };
      expect(ConnectionListResponseSchema.safeParse(response).success).toBe(
        true,
      );
    });

    it("accepts an empty calendar list", () => {
      expect(
        SyncCalendarListResponseSchema.safeParse({ calendars: [] }).success,
      ).toBe(true);
    });

    it("accepts an empty calendar query", () => {
      expect(CalendarListQuerySchema.safeParse({}).success).toBe(true);
    });

    it("accepts a narrowed calendar query", () => {
      const query = {
        connectionId: objectId() as ConnectionId,
        activeOnly: true,
      };
      expect(CalendarListQuerySchema.safeParse(query).success).toBe(true);
    });

    it("rejects principal scoping via the query body", () => {
      const query = { principalId: objectId() as PrincipalId };
      expect(CalendarListQuerySchema.safeParse(query).success).toBe(false);
    });
  });
});
