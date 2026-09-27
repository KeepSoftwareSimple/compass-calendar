import { render, screen } from "@testing-library/react";
import { type ReactElement } from "react";
import { Origin } from "@core/constants/core.constants";
import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import {
  resolveCalendarCardIdentity,
  resolveCalendarFocusColor,
  useCalendarLookup,
} from "@web/calendars/useCalendarLookup";
import { type GridEvent } from "@web/common/types/web.event.types";
import { assembleGridEvent } from "@web/common/utils/event/event.util";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { AllDayEventCard } from "@web/grid/components/AllDayEventCard";
import { TimedEventCard } from "@web/grid/components/TimedEventCard";
import { describe, expect, it } from "bun:test";

// This suite exercises the real useCalendarLookup -> resolveCalendarCardIdentity
// -> card chain end to end (calendars seeded through the query cache, exactly
// as CalendarList.test.tsx seeds calendars.query.ts), rather than
// stubbing the resolved identity - the id -> name resolution and the
// single-calendar gate are the behavior under test, not just the card's
// rendering of a given prop.

const makeCalendar = (overrides: Partial<Calendar> = {}): Calendar => ({
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

const POSITION = { top: 0, left: 0, width: 100, height: 60 };

const makeGridEvent = (overrides: Partial<GridEvent> = {}): GridEvent =>
  assembleGridEvent({
    _id: createObjectIdString(),
    title: "Team sync",
    description: "",
    startDate: "2026-07-13T09:00:00.000-05:00",
    endDate: "2026-07-13T10:00:00.000-05:00",
    origin: Origin.COMPASS,
    isAllDay: false,
    user: "user-1",
    ...overrides,
  });

// Local test-only harness: mirrors how a list component (MainGridEvents,
// AllDayEvents) resolves calendarIdentity via the shared hook/helper and
// passes it down as a prop - not new production code.
function TimedCardWithResolvedIdentity({ event }: { event: GridEvent }) {
  const lookup = useCalendarLookup();
  const calendarIdentity = resolveCalendarCardIdentity(lookup, event);
  const focusColor = resolveCalendarFocusColor(lookup, event);

  return (
    <TimedEventCard
      calendarIdentity={calendarIdentity}
      displayMode="saved"
      event={event}
      focusColor={focusColor}
      motionMode="idle"
      position={POSITION}
    />
  );
}

function AllDayCardWithResolvedIdentity({ event }: { event: GridEvent }) {
  const lookup = useCalendarLookup();
  const calendarIdentity = resolveCalendarCardIdentity(lookup, event);
  const focusColor = resolveCalendarFocusColor(lookup, event);

  return (
    <AllDayEventCard
      calendarIdentity={calendarIdentity}
      event={event}
      focusColor={focusColor}
      isPlaceholder={false}
      position={POSITION}
    />
  );
}

const renderWithCalendars = (ui: ReactElement, calendars: Calendar[]) => {
  const { queryClient, wrapper } = createStoreWrapper();
  queryClient.setQueryData(calendarQueryKeys.all, calendars);
  return render(ui, { wrapper });
};

describe("Calendar identity on event cards", () => {
  it("includes the calendar name in the timed card's accessible label when more than one calendar is active", () => {
    const work = makeCalendar({ name: "Work" });
    const personal = makeCalendar({ name: "Personal" });
    const event = makeGridEvent({ calendarId: work.id });

    renderWithCalendars(<TimedCardWithResolvedIdentity event={event} />, [
      work,
      personal,
    ]);

    expect(
      screen.getByRole("button", { name: /Team sync.*Work calendar/ }),
    ).toBeInTheDocument();
  });

  it("includes the calendar name in the all-day card's accessible label when more than one calendar is active", () => {
    const work = makeCalendar({ name: "Work" });
    const personal = makeCalendar({ name: "Personal" });
    const event = makeGridEvent({ calendarId: personal.id, isAllDay: true });

    renderWithCalendars(<AllDayCardWithResolvedIdentity event={event} />, [
      work,
      personal,
    ]);

    expect(
      screen.getByRole("button", { name: /Team sync.*Personal calendar/ }),
    ).toBeInTheDocument();
  });

  it("omits the calendar name from the timed card's label for a single-calendar account", () => {
    const onlyCalendar = makeCalendar({ name: "Work" });
    const event = makeGridEvent({ calendarId: onlyCalendar.id });

    renderWithCalendars(<TimedCardWithResolvedIdentity event={event} />, [
      onlyCalendar,
    ]);

    const card = screen.getByRole("button", { name: /Team sync/ });
    expect(card.getAttribute("aria-label")).not.toMatch(/calendar$/);
  });

  it("omits the calendar name from the all-day card's label for a single-calendar account", () => {
    const onlyCalendar = makeCalendar({ name: "Work" });
    const event = makeGridEvent({
      calendarId: onlyCalendar.id,
      isAllDay: true,
    });

    renderWithCalendars(<AllDayCardWithResolvedIdentity event={event} />, [
      onlyCalendar,
    ]);

    const card = screen.getByRole("button", { name: /Team sync/ });
    expect(card.getAttribute("aria-label")).not.toMatch(/calendar$/);
  });

  it("omits the calendar name when the event's calendarId doesn't resolve to any active calendar", () => {
    const work = makeCalendar({ name: "Work" });
    const personal = makeCalendar({ name: "Personal" });
    const event = makeGridEvent({
      calendarId: CalendarIdSchema.parse(createObjectIdString()),
    });

    renderWithCalendars(<TimedCardWithResolvedIdentity event={event} />, [
      work,
      personal,
    ]);

    const card = screen.getByRole("button", { name: /Team sync/ });
    expect(card.getAttribute("aria-label")).not.toMatch(/calendar$/);
  });
});

describe("resolveCalendarFocusColor", () => {
  it("returns the calendar color for a single-calendar account", () => {
    const only = makeCalendar({ backgroundColor: "#9e9e9e" });
    const lookup = new Map([[only.id, only]]);

    expect(resolveCalendarFocusColor(lookup, { calendarId: only.id })).toBe(
      "#9e9e9e",
    );
  });

  it("returns the calendar color when multiple calendars are active", () => {
    const work = makeCalendar({ backgroundColor: "#3b82f6" });
    const personal = makeCalendar({ backgroundColor: "#ef4444" });
    const lookup = new Map([
      [work.id, work],
      [personal.id, personal],
    ]);

    expect(resolveCalendarFocusColor(lookup, { calendarId: personal.id })).toBe(
      "#ef4444",
    );
  });

  it("returns null when the calendar is missing or the event has no calendarId", () => {
    const work = makeCalendar();
    const lookup = new Map([[work.id, work]]);

    expect(resolveCalendarFocusColor(lookup, { calendarId: null })).toBeNull();
    expect(
      resolveCalendarFocusColor(lookup, {
        calendarId: CalendarIdSchema.parse(createObjectIdString()),
      }),
    ).toBeNull();
  });

  it("sets --event-focus-color from the calendar on a single-calendar timed card", () => {
    const onlyCalendar = makeCalendar({ backgroundColor: "#616161" });
    const event = makeGridEvent({ calendarId: onlyCalendar.id });

    renderWithCalendars(<TimedCardWithResolvedIdentity event={event} />, [
      onlyCalendar,
    ]);

    const card = screen.getByRole("button", { name: /Team sync/ });
    expect(card.style.getPropertyValue("--event-focus-color")).toBe("#616161");
    expect(card.className).not.toContain("ring-accent");
  });
});
