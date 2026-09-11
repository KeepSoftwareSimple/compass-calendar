import { faker } from "@faker-js/faker";
import {
  type ConnectionId,
  ConnectionIdSchema,
  IdempotencyKeySchema,
  PrincipalIdSchema,
  type ProviderAccountId,
  ProviderAccountIdSchema,
  ProviderCalendarIdSchema,
  ProviderCalendarSourceIdSchema,
  ProviderCapabilitySchema,
  ProviderCapabilitySetSchema,
  ProviderEventIdSchema,
  ProviderKindSchema,
  providerDisplayName,
  providerKindFromThirdPartyId,
  SyncCommandIdSchema,
  SyncJobIdSchema,
  TenantIdSchema,
} from "@core/types/sync/identity.contracts";

const objectIdSchemas = {
  TenantIdSchema,
  PrincipalIdSchema,
  ConnectionIdSchema,
  ProviderCalendarIdSchema,
  SyncCommandIdSchema,
  SyncJobIdSchema,
} as const;

const opaqueIdSchemas = {
  ProviderAccountIdSchema,
  ProviderCalendarSourceIdSchema,
  ProviderEventIdSchema,
  IdempotencyKeySchema,
} as const;

describe("Sync identity contracts", () => {
  describe.each(
    Object.entries(objectIdSchemas),
  )("%s (ObjectId-shaped)", (_name, schema) => {
    it("accepts a 24-character hex id", () => {
      expect(schema.safeParse(faker.database.mongodbObjectId()).success).toBe(
        true,
      );
    });

    it("rejects a short id", () => {
      expect(schema.safeParse("abc123").success).toBe(false);
    });

    it("rejects a non-hex id", () => {
      expect(schema.safeParse("g".repeat(24)).success).toBe(false);
    });

    it("rejects a non-string value", () => {
      expect(schema.safeParse(42).success).toBe(false);
    });

    it("round-trips through JSON unchanged", () => {
      const id = faker.database.mongodbObjectId() as ConnectionId;
      const parsed = schema.parse(id);
      expect(schema.parse(JSON.parse(JSON.stringify(parsed)))).toBe(id);
    });
  });

  describe.each(
    Object.entries(opaqueIdSchemas),
  )("%s (provider-issued/opaque)", (_name, schema) => {
    it("accepts an opaque non-empty string", () => {
      expect(
        schema.safeParse("abc_DEF-123@group.calendar.google.com").success,
      ).toBe(true);
    });

    it("rejects an empty string", () => {
      expect(schema.safeParse("").success).toBe(false);
    });

    it("rejects a whitespace-only string", () => {
      expect(schema.safeParse("   ").success).toBe(false);
    });

    it("rejects a non-string value", () => {
      expect(schema.safeParse(42).success).toBe(false);
    });

    it("round-trips through JSON unchanged", () => {
      const parsed = schema.parse("stable-opaque-id");
      expect(schema.parse(JSON.parse(JSON.stringify(parsed)))).toBe(
        "stable-opaque-id" as ProviderAccountId,
      );
    });
  });

  describe("ProviderAccountIdSchema length bound", () => {
    it("rejects a value over 256 characters", () => {
      expect(ProviderAccountIdSchema.safeParse("a".repeat(257)).success).toBe(
        false,
      );
    });
  });

  describe("ProviderEventIdSchema length bound", () => {
    it("accepts a value at the 1024-character provider limit", () => {
      expect(ProviderEventIdSchema.safeParse("a".repeat(1024)).success).toBe(
        true,
      );
    });

    it("rejects a value over 1024 characters", () => {
      expect(ProviderEventIdSchema.safeParse("a".repeat(1025)).success).toBe(
        false,
      );
    });
  });

  describe("ProviderKindSchema", () => {
    it("accepts google", () => {
      expect(ProviderKindSchema.safeParse("google").success).toBe(true);
    });

    it("accepts microsoft", () => {
      expect(ProviderKindSchema.safeParse("microsoft").success).toBe(true);
    });

    it("accepts apple", () => {
      expect(ProviderKindSchema.safeParse("apple").success).toBe(true);
    });

    it("rejects an unknown provider", () => {
      expect(ProviderKindSchema.safeParse("caldav").success).toBe(false);
    });

    it("rejects provider-cased variants", () => {
      expect(ProviderKindSchema.safeParse("Google").success).toBe(false);
    });
  });

  describe("providerDisplayName", () => {
    it("names each provider for user-facing copy", () => {
      expect(providerDisplayName("google")).toBe("Google");
      expect(providerDisplayName("microsoft")).toBe("Microsoft");
      expect(providerDisplayName("apple")).toBe("Apple");
    });
  });

  describe("providerKindFromThirdPartyId", () => {
    it("maps SuperTokens recipe ids onto Compass provider kinds", () => {
      expect(providerKindFromThirdPartyId("google")).toBe("google");
      expect(providerKindFromThirdPartyId("active-directory")).toBe(
        "microsoft",
      );
      expect(providerKindFromThirdPartyId("apple")).toBe("apple");
      expect(providerKindFromThirdPartyId("unknown")).toBeUndefined();
    });
  });

  describe("ProviderCapabilitySchema", () => {
    it.each([
      "readEvents",
      "writeEvents",
      "readBusy",
      "inviteAttendees",
      "changeNotifications",
      "incrementalChanges",
      "suggestContacts",
      "createTeamsMeeting",
    ] as const)("accepts %s", (capability) => {
      expect(ProviderCapabilitySchema.safeParse(capability).success).toBe(true);
    });

    it("rejects an unknown capability", () => {
      expect(ProviderCapabilitySchema.safeParse("teleport").success).toBe(
        false,
      );
    });
  });

  describe("ProviderCapabilitySetSchema", () => {
    it("accepts an empty set", () => {
      expect(ProviderCapabilitySetSchema.safeParse([]).success).toBe(true);
    });

    it("accepts unique capabilities", () => {
      expect(
        ProviderCapabilitySetSchema.safeParse(["readEvents", "readBusy"])
          .success,
      ).toBe(true);
    });

    it("rejects duplicate capabilities", () => {
      expect(
        ProviderCapabilitySetSchema.safeParse(["readEvents", "readEvents"])
          .success,
      ).toBe(false);
    });

    it("round-trips through JSON unchanged", () => {
      const set = ProviderCapabilitySetSchema.parse([
        "writeEvents",
        "inviteAttendees",
      ]);
      expect(
        ProviderCapabilitySetSchema.parse(JSON.parse(JSON.stringify(set))),
      ).toEqual(["writeEvents", "inviteAttendees"]);
    });
  });
});
