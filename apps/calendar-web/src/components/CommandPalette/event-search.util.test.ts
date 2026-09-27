import { type Event } from "@core/types/event.contracts";
import {
  eventSearchDateString,
  eventSearchDetail,
  paletteEventRoute,
  startFocusEventCard,
} from "@web/components/CommandPalette/event-search.util";
import { POINTER_EVENT_JUMP_REQUEST } from "@web/shortcuts/keyboard-only/pointer-grid-bridge";
import { describe, expect, it } from "bun:test";

const timed = (overrides: { start: string; timeZone: string }): Event =>
  ({
    id: "aaaaaaaaaaaaaaaaaaaaaaaa",
    calendarId: "bbbbbbbbbbbbbbbbbbbbbbbb",
    content: { kind: "details", title: "Dentist", description: "" },
    schedule: {
      kind: "timed",
      start: overrides.start,
      end: "2026-09-16T15:00:00.000Z",
      timeZone: overrides.timeZone,
    },
    recurrence: { kind: "single" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: null,
  }) as Event;

const allDay: Event = {
  id: "cccccccccccccccccccccccc",
  calendarId: "bbbbbbbbbbbbbbbbbbbbbbbb",
  content: { kind: "details", title: "Retreat", description: "" },
  schedule: { kind: "allDay", start: "2026-09-16", end: "2026-09-17" },
  recurrence: { kind: "single" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: null,
} as Event;

describe("event-search.util", () => {
  it("formats a timed event in its own timezone", () => {
    const event = timed({
      start: "2026-09-16T14:00:00.000Z",
      timeZone: "UTC",
    });

    expect(eventSearchDateString(event)).toBe("2026-09-16");
    expect(eventSearchDetail(event)).toBe("Wed, Sep 16, 2:00 PM");
  });

  it("keeps an all-day event on its date-only start", () => {
    expect(eventSearchDateString(allDay)).toBe("2026-09-16");
    expect(eventSearchDetail(allDay)).toBe("Wed, Sep 16, All day");
  });

  it("opens Day view on the day route and other views on the week route", () => {
    expect(paletteEventRoute("day")).toBe("/day/$dateString");
    expect(paletteEventRoute("week")).toBe("/week/$dateString");
    expect(paletteEventRoute("life")).toBe("/week/$dateString");
  });

  it("waits for app-lock to clear before focusing a search hit", async () => {
    document.body.dataset.appLocked = "true";
    const card = document.createElement("div");
    card.setAttribute("data-week-interaction-event-id", "evt-1");
    document.body.appendChild(card);
    const jumps: string[] = [];
    const onJump = (event: globalThis.Event) => {
      const detail = (event as CustomEvent<{ eventId?: string }>).detail;
      if (detail?.eventId) jumps.push(detail.eventId);
    };
    document.addEventListener(POINTER_EVENT_JUMP_REQUEST, onJump);

    try {
      startFocusEventCard("evt-1");
      await Promise.resolve();
      expect(jumps).toEqual([]);

      delete document.body.dataset.appLocked;
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(jumps).toEqual(["evt-1"]);
    } finally {
      document.removeEventListener(POINTER_EVENT_JUMP_REQUEST, onJump);
      card.remove();
      delete document.body.dataset.appLocked;
    }
  });
});
