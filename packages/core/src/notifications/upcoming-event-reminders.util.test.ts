import {
  notificationKey,
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

describe("selectDueEventReminders", () => {
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
