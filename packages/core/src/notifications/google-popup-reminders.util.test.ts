import {
  DEFAULT_POPUP_REMINDER_MINUTES,
  decodePopupReminderMinutes,
  encodePopupReminderMinutes,
  GOOGLE_ACCOUNT_DEFAULT_POPUP_REMINDER_MINUTES,
  resolveGooglePopupReminderMinutes,
} from "@core/notifications/google-popup-reminders.util";
import { describe, expect, it } from "bun:test";

describe("resolveGooglePopupReminderMinutes", () => {
  it("uses calendar defaults when the event defers to them", () => {
    expect(
      resolveGooglePopupReminderMinutes({ useDefault: true }, [10, 0]),
    ).toEqual([10, 0]);
  });

  it("falls back to Google's usual default when useDefault and no calendar defaults", () => {
    expect(resolveGooglePopupReminderMinutes({ useDefault: true }, [])).toEqual(
      GOOGLE_ACCOUNT_DEFAULT_POPUP_REMINDER_MINUTES,
    );
  });

  it("keeps only popup overrides when the event sets custom reminders", () => {
    expect(
      resolveGooglePopupReminderMinutes(
        {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 30 },
            { method: "popup", minutes: 0 },
          ],
        },
        [10],
      ),
    ).toEqual([0]);
  });

  it("returns an empty list when popup overrides are explicitly cleared", () => {
    expect(
      resolveGooglePopupReminderMinutes(
        { useDefault: false, overrides: [{ method: "email", minutes: 10 }] },
        [10],
      ),
    ).toEqual([]);
  });

  it("uses Compass default when Google sends no reminder block", () => {
    expect(resolveGooglePopupReminderMinutes(undefined, [])).toEqual(
      DEFAULT_POPUP_REMINDER_MINUTES,
    );
  });
});

describe("popup reminder metadata codec", () => {
  it("round-trips offsets and marks explicit none", () => {
    expect(encodePopupReminderMinutes([10, 0])).toBe("10,0");
    expect(decodePopupReminderMinutes("10,0")).toEqual([10, 0]);
    expect(encodePopupReminderMinutes([])).toBe("none");
    expect(decodePopupReminderMinutes("none")).toEqual([]);
  });
});
