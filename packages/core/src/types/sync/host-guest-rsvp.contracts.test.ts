import { faker } from "@faker-js/faker";
import { RsvpResponseStatusSchema } from "@core/types/event-attendance.contracts";
import { HostGuestRsvpSummarizeReplySchema } from "@core/types/sync/host-guest-rsvp.contracts";
import { describe, expect, it } from "bun:test";

describe("HostGuestRsvpSummarizeReplySchema", () => {
  it("uses RsvpResponseStatusSchema so host notices track RSVP vocabulary", () => {
    expect(HostGuestRsvpSummarizeReplySchema.shape.responseStatus).toBe(
      RsvpResponseStatusSchema,
    );
  });

  it.each(RsvpResponseStatusSchema.options)(
    "accepts RSVP status %s",
    (responseStatus) => {
      expect(
        HostGuestRsvpSummarizeReplySchema.safeParse({
          id: faker.database.mongodbObjectId(),
          guestName: "Jen",
          responseStatus,
          slotStart: "2026-11-23T18:00:00.000Z",
          firstObservedAt: "2026-11-23T18:01:00.000Z",
        }).success,
      ).toBe(true);
    },
  );

  it("rejects needsAction — a guest has not answered", () => {
    expect(
      HostGuestRsvpSummarizeReplySchema.safeParse({
        id: faker.database.mongodbObjectId(),
        guestName: "Jen",
        responseStatus: "needsAction",
        slotStart: "2026-11-23T18:00:00.000Z",
        firstObservedAt: "2026-11-23T18:01:00.000Z",
      }).success,
    ).toBe(false);
  });
});
