import dayjs from "@core/util/date/dayjs";
import { createTestNotificationPort } from "@web/__tests__/helpers/web-test-seams";
import {
  announceUpcomingEvents,
  NOTIFY_LEAD_MINUTES,
  type NotifiableEvent,
  notifiableEventQueryRange,
  notificationKey,
  pruneFiredKeys,
  selectEventsToNotify,
  toNotifiableEvents,
} from "@web/notifications/upcoming-notifier.logic";
import { setEffectiveTimeZoneForTests } from "@web/timezone/effective-timezone.store";
import { describe, expect, it } from "bun:test";

const NOW = dayjs("2026-03-10T09:00:00.000Z");

const eventAt = (minutesFromNow: number, id = `e${minutesFromNow}`) =>
  ({
    _id: id,
    title: `Event ${id}`,
    startDate: NOW.add(minutesFromNow, "minute").toISOString(),
  }) satisfies NotifiableEvent;

describe("selectEventsToNotify", () => {
  it("includes events inside the default lead window", () => {
    const events = [eventAt(0), eventAt(NOTIFY_LEAD_MINUTES)];

    const due = selectEventsToNotify(NOW, events, new Set());

    expect(
      due.map(
        ({ event, reminderMinutes }) => `${event._id}:${reminderMinutes}`,
      ),
    ).toEqual(["e0:5", "e5:5"]);
  });

  it("excludes events beyond the lead window", () => {
    const due = selectEventsToNotify(
      NOW,
      [eventAt(NOTIFY_LEAD_MINUTES + 1)],
      new Set(),
    );

    expect(due).toEqual([]);
  });

  it("never fires for an event that already started without grace", () => {
    const due = selectEventsToNotify(
      NOW,
      [eventAt(-1), eventAt(-120)],
      new Set(),
    );

    expect(due).toEqual([]);
  });

  it("skips reminder offsets already announced", () => {
    const event = eventAt(3);

    const due = selectEventsToNotify(
      NOW,
      [event],
      new Set([notificationKey(event, NOTIFY_LEAD_MINUTES)]),
    );

    expect(due).toEqual([]);
  });

  it("re-announces an event that moved to a new start time", () => {
    const original = eventAt(3, "same-id");
    const moved = {
      ...original,
      startDate: NOW.add(4, "minute").toISOString(),
    };

    const due = selectEventsToNotify(
      NOW,
      [moved],
      new Set([notificationKey(original, NOTIFY_LEAD_MINUTES)]),
    );

    expect(due).toEqual([
      { event: moved, reminderMinutes: NOTIFY_LEAD_MINUTES },
    ]);
  });

  it("returns the soonest event first", () => {
    const due = selectEventsToNotify(NOW, [eventAt(4), eventAt(1)], new Set());

    expect(due.map(({ event }) => event._id)).toEqual(["e1", "e4"]);
  });

  it("fires synced Google popup offsets such as ten minutes before start", () => {
    const event = {
      ...eventAt(10, "synced"),
      popupReminderMinutes: [10],
    };

    const due = selectEventsToNotify(NOW, [event], new Set());

    expect(due).toEqual([{ event, reminderMinutes: 10 }]);
  });
});

describe("toNotifiableEvents", () => {
  it("keeps a saved event and carries its title and start time through", () => {
    const event = eventAt(3, "real");

    expect(toNotifiableEvents([event])).toEqual([
      { _id: "real", title: "Event real", startDate: event.startDate },
    ]);
  });

  it("drops seeded sample events", () => {
    const demo = { ...eventAt(3, "sample"), isDemo: true };

    expect(toNotifiableEvents([demo])).toEqual([]);
  });

  it("drops an unsaved draft that has no id to de-dupe on", () => {
    const draft = { title: "Untitled", startDate: NOW.toISOString() };

    expect(toNotifiableEvents([draft])).toEqual([]);
  });
});

describe("announceUpcomingEvents", () => {
  const seam = () => {
    const { port, mocks } = createTestNotificationPort({
      permission: "granted",
    });
    return { port, show: mocks.show };
  };

  it("shows the event title and how long until start", () => {
    const { port, show } = seam();
    setEffectiveTimeZoneForTests("America/Denver");

    announceUpcomingEvents(port, NOW, [eventAt(3, "standup")], new Set());

    expect(show).toHaveBeenCalledTimes(1);
    const [title, options] = show.mock.calls[0] as [string, { body: string }];
    expect(title).toBe("Event standup");
    expect(options.body).toMatch(/^Starts in 3 minutes \(/);
  });

  it("states the start time in the calendar's timezone, not the browser's", () => {
    const { port, show } = seam();
    setEffectiveTimeZoneForTests("Europe/Berlin");

    announceUpcomingEvents(port, NOW, [eventAt(3)], new Set());

    const [, options] = show.mock.calls[0] as [string, { body: string }];
    expect(options.body).toMatch(/^Starts in 3 minutes \(/);
  });

  it("tags each notification with its de-dupe key so reloads replace, not stack", () => {
    const { port, show } = seam();
    const event = eventAt(3);

    announceUpcomingEvents(port, NOW, [event], new Set());

    const [, options] = show.mock.calls[0] as [string, { tag: string }];
    expect(options.tag).toBe(notificationKey(event, NOTIFY_LEAD_MINUTES));
  });

  it("falls back to a placeholder when the event has no title", () => {
    const { port, show } = seam();

    announceUpcomingEvents(
      port,
      NOW,
      [{ ...eventAt(2), title: "   " }],
      new Set(),
    );

    expect(show.mock.calls[0]?.[0]).toBe("Untitled event");
  });

  it("announces an event once, however often the tick re-runs", () => {
    const { port, show } = seam();
    const events = [eventAt(3)];

    let fired = announceUpcomingEvents(port, NOW, events, new Set());
    fired = announceUpcomingEvents(port, NOW, events, fired);
    announceUpcomingEvents(port, NOW.add(1, "minute"), events, fired);

    expect(show).toHaveBeenCalledTimes(1);
  });

  it("stays silent, and preserves the fired keys, when nothing is due", () => {
    const { port, show } = seam();
    const existing = new Set([
      notificationKey(eventAt(1, "already"), NOTIFY_LEAD_MINUTES),
    ]);

    const fired = announceUpcomingEvents(port, NOW, [eventAt(90)], existing);

    expect(show).not.toHaveBeenCalled();
    expect([...fired]).toEqual([...existing]);
  });

  it("does not burn the de-dupe key when the browser silently drops the notification", () => {
    const { port, mocks } = createTestNotificationPort({
      permission: "granted",
      showSucceeds: false,
    });
    const event = eventAt(3);

    const fired = announceUpcomingEvents(port, NOW, [event], new Set());

    expect(mocks.show).toHaveBeenCalledTimes(1);
    expect([...fired]).toEqual([]);

    mocks.show.mockImplementation(() => true);
    const retried = announceUpcomingEvents(port, NOW, [event], fired);

    expect(mocks.show).toHaveBeenCalledTimes(2);
    expect([...retried]).toEqual([notificationKey(event, NOTIFY_LEAD_MINUTES)]);
  });
});

describe("pruneFiredKeys", () => {
  it("keeps recent keys and drops ones older than a day", () => {
    const recent = notificationKey(eventAt(-60, "recent"), 5);
    const stale = notificationKey(
      {
        _id: "stale",
        startDate: NOW.subtract(25, "hour").toISOString(),
      },
      5,
    );

    const pruned = pruneFiredKeys(new Set([recent, stale]), NOW);

    expect([...pruned]).toEqual([recent]);
  });

  it("drops keys that carry no parseable start time", () => {
    const pruned = pruneFiredKeys(new Set(["broken-key-without-date"]), NOW);

    expect([...pruned]).toEqual([]);
  });
});

describe("notifiableEventQueryRange", () => {
  it("keeps today's local day and extends into tomorrow for long lead times", () => {
    setEffectiveTimeZoneForTests("America/Denver");
    const now = dayjs.tz("2026-07-16 23:56", "America/Denver");

    const { startDate, endDate } = notifiableEventQueryRange(now);

    const evening = dayjs.tz("2026-07-16 21:00", "America/Denver");
    const justAfterMidnight = dayjs.tz("2026-07-17 00:03", "America/Denver");
    const beyondLookahead = dayjs.tz("2026-07-18 01:00", "America/Denver");

    expect(evening.valueOf()).toBeGreaterThanOrEqual(Date.parse(startDate));
    expect(evening.valueOf()).toBeLessThan(Date.parse(endDate));
    expect(justAfterMidnight.valueOf()).toBeGreaterThanOrEqual(
      Date.parse(startDate),
    );
    expect(justAfterMidnight.valueOf()).toBeLessThan(Date.parse(endDate));
    expect(beyondLookahead.valueOf()).toBeGreaterThanOrEqual(
      Date.parse(endDate),
    );
  });
});
