import { SHORTCUTS_REGISTRY } from "@web/shortcuts/shortcuts.registry";
import { rankShortcutHints } from "@web/shortcuts/tips/rankShortcutHints";
import { selectShortcutHint } from "@web/shortcuts/tips/selectShortcutHint";
import { type ShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import {
  getShortcutHint,
  type RankedShortcutHint,
  type ShortcutHintId,
} from "@web/shortcuts/tips/shortcut-tips.data";
import {
  recordPointerIntentDetection,
  resetPointerIntentSessionForTests,
} from "@web/views/Week/pointer-intent/pointer-intent.session";
import { beforeEach, describe, expect, it } from "bun:test";

const hintFor = (
  ...args: Parameters<typeof selectShortcutHint>
): RankedShortcutHint => selectShortcutHint(...args)!;

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

const IDLE_HINT_POOL = [
  "page-jump",
  "event-jump",
  "command-palette",
  "create-event",
  "grid-scroll",
  "week-nav",
] as const satisfies readonly ShortcutHintId[];

describe("shortcut hint personalization", () => {
  beforeEach(() => {
    resetPointerIntentSessionForTests();
  });
  it("preserves the deterministic order when local history is missing", () => {
    expect(hintFor(calendarIdle).id).toBe("page-jump");
    expect(hintFor(calendarIdle, ["page-jump", "event-jump"]).id).toBe(
      "command-palette",
    );
  });

  it("cools down a repeatedly shown suggestion without leaving its context pool", () => {
    const hint = hintFor(
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
    const hint = hintFor(
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
        "calendar.grid_scroll": {
          invocations: 2,
          lastInvokedAt: NOW,
          recentImpressions: 0,
        },
        "calendar.week_nav": {
          invocations: 2,
          lastInvokedAt: NOW,
          recentImpressions: 0,
        },
      }),
      NOW,
    );

    expect(hint.id).toBe("page-jump");
    expect(hint.reasonCode).toBe("local_recency");
  });

  it("cools down after two impressions in the window", () => {
    const hint = hintFor(
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
    const hint = hintFor(
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
    const hint = hintFor(
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
        "calendar.grid_scroll": {
          invocations: 9,
          recentImpressions: 0,
        },
        "calendar.week_nav": {
          invocations: 9,
          recentImpressions: 0,
        },
      }),
      NOW,
    );

    expect(hint.id).toBe("page-jump");
  });

  it("never promotes an ineligible focused-event action into an idle calendar", () => {
    const hint = hintFor(
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

  it("ranks create-event first when slot-click was detected", () => {
    recordPointerIntentDetection("slot-click");
    const hint = rankShortcutHints(IDLE_HINT_POOL, [], profile({}), NOW);
    expect(hint.id).toBe("create-event");
  });

  it("maps grid-scroll and week-nav tips to registry rows", () => {
    for (const id of ["grid-scroll", "week-nav"] as const) {
      const hint = getShortcutHint(id);
      for (const registryId of hint.registryIds ?? []) {
        expect(SHORTCUTS_REGISTRY.some((row) => row.id === registryId)).toBe(
          true,
        );
      }
    }
  });
});
