import {
  type AdminPutBookingPageInput,
  buildDefaultAdminPutInput,
} from "@core/types/booking.contracts";
import {
  CalendarIdSchema,
  TimeZoneSchema,
} from "@core/types/domain-primitives";
import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import {
  clearGuestMeetingSetupDraft,
  guestDraftForAuthenticatedHost,
  readGuestMeetingSetupDraft,
  writeGuestMeetingSetupDraft,
} from "@web/booking/guest-meeting-setup.util";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { beforeEach, describe, expect, it } from "bun:test";

const draft = (
  overrides: Partial<AdminPutBookingPageInput> = {},
): AdminPutBookingPageInput => ({
  ...buildDefaultAdminPutInput(TimeZoneSchema.parse("Europe/Berlin")),
  ...overrides,
});

describe("guest meeting setup draft", () => {
  beforeEach(() => {
    persistentBrowserStore.remove(STORAGE_KEYS.GUEST_MEETING_SETUP_DRAFT);
  });

  it("has no draft before the guest touches the wizard", () => {
    expect(readGuestMeetingSetupDraft()).toBeNull();
  });

  it("round-trips the wizard form", () => {
    const form = draft({ durationMinutes: 45 });

    writeGuestMeetingSetupDraft(form);

    expect(readGuestMeetingSetupDraft()).toEqual(form);
  });

  it("clears the draft once it has been claimed", () => {
    writeGuestMeetingSetupDraft(draft());

    clearGuestMeetingSetupDraft();

    expect(readGuestMeetingSetupDraft()).toBeNull();
  });

  it("reads as no draft when the stored value is not a booking form", () => {
    persistentBrowserStore.set(
      STORAGE_KEYS.GUEST_MEETING_SETUP_DRAFT,
      JSON.stringify({ durationMinutes: "forty five" }),
    );

    expect(readGuestMeetingSetupDraft()).toBeNull();
  });

  it("resets the destination to the first writable calendar after sign-up", () => {
    const writable = createMockCalendar({
      id: CalendarIdSchema.parse(createObjectIdString()),
    });
    const form = draft({ slug: "meet-me" });

    const hydrated = guestDraftForAuthenticatedHost(
      form,
      [writable],
      [writable],
    );

    expect(hydrated.slug).toBe("meet-me");
    expect(hydrated.destinationCalendarId).toBe(writable.id);
    expect(hydrated.blockingCalendarIds).toContain(writable.id);
  });

  it("reads as no draft when the stored value is not JSON", () => {
    persistentBrowserStore.set(
      STORAGE_KEYS.GUEST_MEETING_SETUP_DRAFT,
      "{not json",
    );

    expect(readGuestMeetingSetupDraft()).toBeNull();
  });
});
