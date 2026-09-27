import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { filterEventsByVisibleCalendars } from "./filter-events-by-visible-calendars";
import { describe, expect, it } from "bun:test";

const calendar = (overrides: Partial<Calendar> = {}): Calendar => ({
  id: CalendarIdSchema.parse(createObjectIdString()),
  name: "Work",
  description: "",
  timeZone: null,
  foregroundColor: "#000000",
  backgroundColor: "#3b82f6",
  provider: "google",
  access: "owner",
  capabilities: getCalendarCapabilities("owner"),
  isPrimary: false,
  isVisible: true,
  isActive: true,
  ...overrides,
});

describe("filterEventsByVisibleCalendars", () => {
  it("passes data through when calendars have not loaded", () => {
    const event = createMockEvent();
    const data = {
      ids: [event.id],
      entities: { [event.id]: event },
    };
    expect(filterEventsByVisibleCalendars(data, undefined)).toBe(data);
  });

  it("drops events on hidden calendars", () => {
    const visible = calendar({ isVisible: true });
    const hidden = calendar({ isVisible: false });
    const kept = createMockEvent({ calendarId: visible.id });
    const dropped = createMockEvent({ calendarId: hidden.id });
    const data = {
      ids: [kept.id, dropped.id],
      entities: { [kept.id]: kept, [dropped.id]: dropped },
    };

    const filtered = filterEventsByVisibleCalendars(data, [visible, hidden]);
    expect(filtered?.ids).toEqual([kept.id]);
    expect(filtered?.entities[dropped.id]).toBeUndefined();
    expect(filtered?.entities[kept.id]).toBeDefined();
  });

  it("drops events on a retired (inactive) calendar even when it is still visible", () => {
    // A calendar the provider no longer lists is deactivated, not deleted, and
    // client-side visibility (isVisible) is separate browser-local state that
    // nothing clears on retirement. Without checking isActive here, a
    // deleted-at-Google calendar's events would keep rendering in the grid.
    const active = calendar({ isActive: true, isVisible: true });
    const retired = calendar({ isActive: false, isVisible: true });
    const kept = createMockEvent({ calendarId: active.id });
    const dropped = createMockEvent({ calendarId: retired.id });
    const data = {
      ids: [kept.id, dropped.id],
      entities: { [kept.id]: kept, [dropped.id]: dropped },
    };

    const filtered = filterEventsByVisibleCalendars(data, [active, retired]);
    expect(filtered?.ids).toEqual([kept.id]);
    expect(filtered?.entities[dropped.id]).toBeUndefined();
    expect(filtered?.entities[kept.id]).toBeDefined();
  });
});
