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
  it("includes events inside the lead window, at both edges", () => {
    const events = [eventAt(0), eventAt(NOTIFY_LEAD_MINUTES)];

    const due = selectEventsToNotify(NOW, events, new Set());

    expect(due.map((event) => event._id)).toEqual(["e0", "e5"]);
  });

  it("excludes events beyond the lead window", () => {
    const due = selectEventsToNotify(
      NOW,
      [eventAt(NOTIFY_LEAD_MINUTES + 1)],
      new Set(),
    );

    expect(due).toEqual([]);
  });

  it("never fires for an event that already started", () => {
    // The catch-up tick after a laptop wakes would otherwise dump a burst of
    // notifications for meetings that began hours ago.
    const due = selectEventsToNotify(
      NOW,
      [eventAt(-1), eventAt(-120)],
      new Set(),
    );

    expect(due).toEqual([]);
  });

  it("skips events already announced", () => {
    const event = eventAt(3);

    const due = selectEventsToNotify(
      NOW,
      [event],
      new Set([notificationKey(event)]),
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
      new Set([notificationKey(original)]),
    );

    expect(due).toEqual([moved]);
  });

  it("returns the soonest event first", () => {
    const due = selectEventsToNotify(NOW, [eventAt(4), eventAt(1)], new Set());

    expect(due.map((event) => event._id)).toEqual(["e1", "e4"]);
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
    // First run seeds a workday of these and offers notifications in the same
    // breath; an OS notification for a fake meeting is worse than none.
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

  it("shows the event title and its start time", () => {
    const { port, show } = seam();
    // Pinned, and asserted as a literal rather than rebuilding the
    // implementation's own formatting: 09:03 UTC is 3:03 AM in Denver (MDT).
    setEffectiveTimeZoneForTests("America/Denver");

    announceUpcomingEvents(port, NOW, [eventAt(3, "standup")], new Set());

    expect(show).toHaveBeenCalledTimes(1);
    const [title, options] = show.mock.calls[0] as [string, { body: string }];
    expect(title).toBe("Event standup");
    expect(options.body).toBe("Starts at 3:03 AM");
  });

  it("states the start time in the calendar's timezone, not the browser's", () => {
    const { port, show } = seam();
    // The same instant, read in a different pinned zone: 09:03 UTC is
    // 10:03 AM in Berlin (CET on this date).
    setEffectiveTimeZoneForTests("Europe/Berlin");

    announceUpcomingEvents(port, NOW, [eventAt(3)], new Set());

    const [, options] = show.mock.calls[0] as [string, { body: string }];
    expect(options.body).toBe("Starts at 10:03 AM");
  });

  it("tags each notification with its de-dupe key so reloads replace, not stack", () => {
    const { port, show } = seam();
    const event = eventAt(3);

    announceUpcomingEvents(port, NOW, [event], new Set());

    const [, options] = show.mock.calls[0] as [string, { tag: string }];
    expect(options.tag).toBe(notificationKey(event));
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
    const existing = new Set([notificationKey(eventAt(1, "already"))]);

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
    expect([...retried]).toEqual([notificationKey(event)]);
  });
});

describe("pruneFiredKeys", () => {
  it("keeps recent keys and drops ones older than a day", () => {
    const recent = notificationKey(eventAt(-60, "recent"));
    const stale = notificationKey({
      _id: "stale",
      startDate: NOW.subtract(25, "hour").toISOString(),
    });

    const pruned = pruneFiredKeys(new Set([recent, stale]), NOW);

    expect([...pruned]).toEqual([recent]);
  });

  it("drops keys that carry no parseable start time", () => {
    const pruned = pruneFiredKeys(new Set(["broken-key-without-date"]), NOW);

    expect([...pruned]).toEqual([]);
  });
});

describe("notifiableEventQueryRange", () => {
  it("keeps today's local day and extends five minutes into tomorrow", () => {
    setEffectiveTimeZoneForTests("America/Denver");
    const now = dayjs.tz("2026-07-16 23:56", "America/Denver");

    const { startDate, endDate } = notifiableEventQueryRange(now);

    const evening = dayjs.tz("2026-07-16 21:00", "America/Denver");
    const justAfterMidnight = dayjs.tz("2026-07-17 00:03", "America/Denver");
    const afterLead = dayjs.tz("2026-07-17 00:06", "America/Denver");

    expect(evening.valueOf()).toBeGreaterThanOrEqual(Date.parse(startDate));
    expect(evening.valueOf()).toBeLessThan(Date.parse(endDate));
    expect(justAfterMidnight.valueOf()).toBeGreaterThanOrEqual(
      Date.parse(startDate),
    );
    expect(justAfterMidnight.valueOf()).toBeLessThan(Date.parse(endDate));
    expect(afterLead.valueOf()).toBeGreaterThanOrEqual(Date.parse(endDate));
  });
});
