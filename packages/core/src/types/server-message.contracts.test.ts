import { faker } from "@faker-js/faker";
import {
  CalendarChangeMessageSchema,
  EventChangeMessageSchema,
  ImportResultMessageSchema,
  revokedConnectionServerMessages,
  ServerMessageSchema,
  SyncStatusMessageSchema,
  UserMetadataMessageSchema,
} from "@core/types/server-message.contracts";

const calendarId = () => faker.database.mongodbObjectId();
const eventId = () => faker.database.mongodbObjectId();

describe("Server Message Contracts", () => {
  describe("EventChangeMessageSchema", () => {
    it("parses a realistic eventsChanged message", () => {
      const message = {
        type: "eventsChanged",
        calendarId: calendarId(),
        eventIds: [eventId(), eventId()],
        reason: "updated",
      };

      expect(EventChangeMessageSchema.safeParse(message).success).toBe(true);
    });

    it("accepts an empty eventIds array (invalidate the whole calendar)", () => {
      const message = {
        type: "eventsChanged",
        calendarId: calendarId(),
        eventIds: [],
        reason: "reconciled",
      };

      expect(EventChangeMessageSchema.safeParse(message).success).toBe(true);
    });

    it("rejects an unrecognized reason", () => {
      const message = {
        type: "eventsChanged",
        calendarId: calendarId(),
        eventIds: [],
        reason: "renamed",
      };

      expect(EventChangeMessageSchema.safeParse(message).success).toBe(false);
    });
  });

  describe("CalendarChangeMessageSchema", () => {
    it("parses a realistic calendarsChanged message", () => {
      const message = { type: "calendarsChanged", calendarIds: [calendarId()] };

      expect(CalendarChangeMessageSchema.safeParse(message).success).toBe(true);
    });
  });

  describe("SyncStatusMessageSchema", () => {
    it("parses a syncing status", () => {
      const message = {
        type: "syncStatusChanged",
        sync: { status: "syncing" },
      };

      expect(SyncStatusMessageSchema.safeParse(message).success).toBe(true);
    });

    it("parses a healthy status", () => {
      const message = {
        type: "syncStatusChanged",
        sync: { status: "healthy" },
      };

      expect(SyncStatusMessageSchema.safeParse(message).success).toBe(true);
    });

    it("parses an attention status with code and retryable", () => {
      const message = {
        type: "syncStatusChanged",
        sync: { status: "attention", code: "GOOGLE_REVOKED", retryable: false },
      };

      expect(SyncStatusMessageSchema.safeParse(message).success).toBe(true);
    });

    it("parses CONNECTION_REVOKED with a connectionId", () => {
      const message = {
        type: "syncStatusChanged",
        sync: {
          status: "attention",
          code: "CONNECTION_REVOKED",
          connectionId: calendarId(),
          retryable: false,
        },
      };

      expect(SyncStatusMessageSchema.safeParse(message).success).toBe(true);
    });

    it("rejects an attention status missing code and retryable", () => {
      const message = {
        type: "syncStatusChanged",
        sync: { status: "attention" },
      };

      expect(SyncStatusMessageSchema.safeParse(message).success).toBe(false);
    });
  });

  describe("ImportResultMessageSchema", () => {
    it("parses a realistic importCompleted message", () => {
      const message = {
        type: "importCompleted",
        operation: "full",
        eventsCount: 120,
        calendarsCount: 3,
      };

      expect(ImportResultMessageSchema.safeParse(message).success).toBe(true);
    });

    it("rejects a negative eventsCount", () => {
      const message = {
        type: "importCompleted",
        operation: "incremental",
        eventsCount: -1,
        calendarsCount: 0,
      };

      expect(ImportResultMessageSchema.safeParse(message).success).toBe(false);
    });

    it("rejects a non-integer calendarsCount", () => {
      const message = {
        type: "importCompleted",
        operation: "repair",
        eventsCount: 0,
        calendarsCount: 1.5,
      };

      expect(ImportResultMessageSchema.safeParse(message).success).toBe(false);
    });
  });

  describe("UserMetadataMessageSchema", () => {
    it("parses a realistic userMetadataChanged message", () => {
      const message = {
        type: "userMetadataChanged",
        metadata: { syncEnabled: true, plan: "free" },
      };

      expect(UserMetadataMessageSchema.safeParse(message).success).toBe(true);
    });
  });

  describe("ServerMessageSchema", () => {
    it("rejects an unknown message type", () => {
      const message = { type: "somethingElse" };

      expect(ServerMessageSchema.safeParse(message).success).toBe(false);
    });

    it("parses every union member from a realistic payload", () => {
      const messages = [
        {
          type: "eventsChanged",
          calendarId: calendarId(),
          eventIds: [],
          reason: "created",
        },
        { type: "calendarsChanged", calendarIds: [calendarId()] },
        { type: "syncStatusChanged", sync: { status: "healthy" } },
        {
          type: "importCompleted",
          operation: "full",
          eventsCount: 0,
          calendarsCount: 0,
        },
        { type: "userMetadataChanged", metadata: {} },
      ];

      for (const message of messages) {
        expect(ServerMessageSchema.safeParse(message).success).toBe(true);
      }
    });

    it("emits CONNECTION_REVOKED and GOOGLE_REVOKED for a revoked connection", () => {
      const connectionId = calendarId();
      const messages = revokedConnectionServerMessages(connectionId);

      expect<unknown>(messages).toEqual([
        {
          type: "syncStatusChanged",
          sync: {
            status: "attention",
            code: "CONNECTION_REVOKED",
            connectionId,
            retryable: false,
          },
        },
        {
          type: "syncStatusChanged",
          sync: {
            status: "attention",
            code: "GOOGLE_REVOKED",
            retryable: false,
          },
        },
      ]);

      for (const message of messages) {
        expect(ServerMessageSchema.safeParse(message).success).toBe(true);
      }
    });
  });
});
