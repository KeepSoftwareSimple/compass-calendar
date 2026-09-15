import { selectShortcutHint } from "@web/shortcuts/tips/selectShortcutHint";
import { type ShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import { describe, expect, it } from "bun:test";

const NOW = new Date("2026-08-27T12:00:00.000Z").getTime();
const DAY_MS = 24 * 60 * 60 * 1000;
const calendarIdle = {
  isFormOpen: false,
  isLifeView: false,
  eventFocused: false,
  firstEventDone: true,
};

const profile = (
  actions: ShortcutUsageProfile["actions"],
): ShortcutUsageProfile => ({ version: 2, actions, shortcuts: {} });

describe("shortcut hint personalization", () => {
  it("preserves the deterministic order when local history is missing", () => {
    expect(selectShortcutHint(calendarIdle).id).toBe("page-jump");
    expect(
      selectShortcutHint(calendarIdle, ["page-jump", "event-jump"]).id,
    ).toBe("command-palette");
  });

  it("cools down a repeatedly shown suggestion without leaving its context pool", () => {
    const hint = selectShortcutHint(
      calendarIdle,
      [],
      profile({
        "calendar.page_jump": {
          invocations: 0,
          lastShownAt: NOW,
          recentImpressions: 3,
        },
      }),
      NOW,
    );

    expect(hint.id).toBe("event-jump");
    expect(hint.reasonCode).toBe("local_fatigue");
  });

  it("prefers a stale learned action over the action used moments ago", () => {
    const demonstrated = [
      "event-jump",
      "command-palette",
      "create-event",
      "page-jump",
    ] as const;
    const hint = selectShortcutHint(
      calendarIdle,
      demonstrated,
      profile({
        "calendar.event_jump": {
          invocations: 3,
          lastInvokedAt: NOW,
          recentImpressions: 0,
        },
        "calendar.page_jump": {
          invocations: 1,
          lastInvokedAt: NOW - 31 * DAY_MS,
          recentImpressions: 0,
        },
      }),
      NOW,
    );

    expect(hint.id).toBe("page-jump");
    expect(hint.reasonCode).toBe("local_recency");
  });

  it("cools down after two impressions in the window", () => {
    const hint = selectShortcutHint(
      calendarIdle,
      [],
      profile({
        "calendar.page_jump": {
          invocations: 0,
          lastShownAt: NOW,
          recentImpressions: 2,
        },
      }),
      NOW,
    );

    expect(hint.id).toBe("event-jump");
    expect(hint.reasonCode).toBe("local_fatigue");
  });

  it("stops teaching a shortcut the user has clearly learned", () => {
    const hint = selectShortcutHint(
      calendarIdle,
      [],
      profile({
        "calendar.page_jump": { invocations: 5, recentImpressions: 0 },
      }),
      NOW,
    );

    expect(hint.id).toBe("event-jump");
  });

  it("keeps teaching the pool once every shortcut in it is learned", () => {
    const hint = selectShortcutHint(
      calendarIdle,
      [],
      profile({
        "calendar.page_jump": { invocations: 9, recentImpressions: 0 },
        "calendar.event_jump": { invocations: 9, recentImpressions: 0 },
        "command_palette.open": { invocations: 9, recentImpressions: 0 },
        "calendar.create_timed_event": {
          invocations: 9,
          recentImpressions: 0,
        },
      }),
      NOW,
    );

    expect(hint.id).toBe("page-jump");
  });

  it("never promotes an ineligible focused-event action into an idle calendar", () => {
    const hint = selectShortcutHint(
      calendarIdle,
      [],
      profile({
        "event.edit_title": {
          invocations: 0,
          recentImpressions: 0,
        },
        "calendar.page_jump": {
          invocations: 0,
          lastShownAt: NOW,
          recentImpressions: 3,
        },
      }),
      NOW,
    );

    expect(hint.id).toBe("event-jump");
  });
});
