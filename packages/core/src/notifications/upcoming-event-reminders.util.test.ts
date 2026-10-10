import {
  DEFAULT_POPUP_REMINDER_MINUTES,
  notificationKey,
  notificationKeyStartDate,
  selectDueEventReminders,
} from "@core/notifications/upcoming-event-reminders.util";
import dayjs from "@core/util/date/dayjs";
import { describe, expect, it } from "bun:test";

const NOW = dayjs("2026-10-09T15:20:00.000Z");

const eventAt = (
  minutesFromNow: number,
  id = "e1",
  popupReminderMinutes?: readonly number[],
) => ({
  _id: id,
  title: "Meet",
  startDate: NOW.add(minutesFromNow, "minute").toISOString(),
  popupReminderMinutes,
});

const DEFAULT_LEAD_MINUTES = DEFAULT_POPUP_REMINDER_MINUTES[0]!;

describe("selectDueEventReminders", () => {
  it("includes events inside the default lead window", () => {
    const due = selectDueEventReminders(
      NOW,
      [eventAt(0, "e0"), eventAt(DEFAULT_LEAD_MINUTES, "e5")],
      new Set(),
    );

    expect(
      due.map(
        ({ event, reminderMinutes }) => `${event._id}:${reminderMinutes}`,
      ),
    ).toEqual([`e0:${DEFAULT_LEAD_MINUTES}`, `e5:${DEFAULT_LEAD_MINUTES}`]);
  });

  it("excludes events beyond the default lead window", () => {
    expect(
      selectDueEventReminders(
        NOW,
        [eventAt(DEFAULT_LEAD_MINUTES + 1)],
        new Set(),
      ),
    ).toEqual([]);
  });

  it("never fires for an event that already started without grace", () => {
    expect(
      selectDueEventReminders(
        NOW,
        [eventAt(-1, "just-started"), eventAt(-120, "long-gone")],
        new Set(),
      ),
    ).toEqual([]);
  });

  it("re-announces an event that moved to a new start time", () => {
    const original = eventAt(3, "same-id");
    const moved = {
      ...original,
      startDate: NOW.add(4, "minute").toISOString(),
    };

    const due = selectDueEventReminders(
      NOW,
      [moved],
      new Set([notificationKey(original, DEFAULT_LEAD_MINUTES)]),
    );

    expect(due).toEqual([
      { event: moved, reminderMinutes: DEFAULT_LEAD_MINUTES },
    ]);
  });

  it("returns the soonest event first", () => {
    const due = selectDueEventReminders(
      NOW,
      [eventAt(4, "e4"), eventAt(1, "e1")],
      new Set(),
    );

    expect(due.map(({ event }) => event._id)).toEqual(["e1", "e4"]);
  });

  it("fires synced popup offsets when their lead time is reached", () => {
    const due = selectDueEventReminders(
      NOW,
      [eventAt(10, "e1", [10])],
      new Set(),
    );

    expect(due).toEqual([
      { event: eventAt(10, "e1", [10]), reminderMinutes: 10 },
    ]);
  });

  it("does not fire a 10-minute reminder while still 11 minutes away", () => {
    expect(
      selectDueEventReminders(NOW, [eventAt(11, "e1", [10])], new Set()),
    ).toEqual([]);
  });

  it("fires at event start for a zero-minute popup reminder", () => {
    const due = selectDueEventReminders(
      NOW,
      [eventAt(0, "e1", [0])],
      new Set(),
    );

    expect(due[0]?.reminderMinutes).toBe(0);
  });

  it("honors missed grace after a background tab slept through the window", () => {
    const event = eventAt(-3, "e1", [5]);

    expect(
      selectDueEventReminders(NOW, [event], new Set(), {
        allowMissedGrace: true,
      }),
    ).toEqual([{ event, reminderMinutes: 5 }]);
  });

  it("skips already-fired reminder offsets", () => {
    const event = eventAt(5, "e1", [10, 5]);
    const fired = new Set([notificationKey(event, 10)]);

    const due = selectDueEventReminders(NOW, [event], fired);

    expect(due).toEqual([{ event, reminderMinutes: 5 }]);
  });
});

describe("notificationKeyStartDate", () => {
  it("reads back the start date a key was built from", () => {
    const event = eventAt(5, "e1");

    expect(notificationKeyStartDate(notificationKey(event, 5))).toBe(
      event.startDate,
    );
  });

  it("returns null for a string that is not a notification key", () => {
    expect(notificationKeyStartDate("not-a-key")).toBeNull();
  });
});
