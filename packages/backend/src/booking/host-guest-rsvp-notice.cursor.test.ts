import { ObjectId } from "mongodb";
import {
  HOST_GUEST_RSVP_NOTICE_EPOCH_MS,
  hostGuestRsvpSummarizeCursor,
} from "@backend/booking/host-guest-rsvp-notice.cursor";
import { type HostGuestRsvpNoticeStateRecord } from "@backend/booking/host-guest-rsvp-notice.record";
import { describe, expect, it } from "bun:test";

const state = (
  overrides: Partial<HostGuestRsvpNoticeStateRecord> = {},
): HostGuestRsvpNoticeStateRecord => ({
  _id: new ObjectId(),
  userId: new ObjectId(),
  createdAt: new Date("2026-11-09T12:00:00.000Z"),
  updatedAt: new Date("2026-11-09T12:00:00.000Z"),
  ...overrides,
});

describe("hostGuestRsvpSummarizeCursor", () => {
  it("uses epoch before the first stamp so backlog is claimable", () => {
    expect(hostGuestRsvpSummarizeCursor(state())).toEqual({
      firstObservedAt: new Date(HOST_GUEST_RSVP_NOTICE_EPOCH_MS).toISOString(),
    });
  });

  it("resumes from the stamped cursor", () => {
    const noticedAt = new Date("2026-11-08T08:00:00.000Z");
    const observationId = new ObjectId();
    expect(
      hostGuestRsvpSummarizeCursor(
        state({ noticedAt, noticedObservationId: observationId }),
      ),
    ).toEqual({
      firstObservedAt: noticedAt.toISOString(),
      observationId: observationId.toString(),
    });
  });
});
