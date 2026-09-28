import {
  type AdminPutBookingPageInput,
  buildDefaultAdminPutInput,
} from "@core/types/booking.contracts";
import { TimeZoneSchema } from "@core/types/domain-primitives";
import {
  clearGuestMeetingSetupDraft,
  readGuestMeetingSetupDraft,
  writeGuestMeetingSetupDraft,
} from "@web/booking/guest-meeting-setup.util";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
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

  it("reads as no draft when the stored value is not JSON", () => {
    persistentBrowserStore.set(
      STORAGE_KEYS.GUEST_MEETING_SETUP_DRAFT,
      "{not json",
    );

    expect(readGuestMeetingSetupDraft()).toBeNull();
  });
});
