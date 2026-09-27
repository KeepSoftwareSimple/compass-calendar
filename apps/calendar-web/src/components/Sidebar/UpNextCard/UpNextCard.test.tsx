import {
  type Calendar,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import {
  CalendarIdSchema,
  EventIdSchema,
  TimeZoneSchema,
} from "@core/types/domain-primitives";
import { type Event, EventScheduleSchema } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@web/__tests__/__mocks__/mock.render";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { createCompassQueryClient } from "@web/api/query-client";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { setCalendarVisibility } from "@web/calendars/calendar-visibility.store";
import { draftActions, useDraftStore } from "@web/events/stores/draft.store";
import { formatStartsIn, UpNextCard } from "./UpNextCard";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  setSystemTime,
} from "bun:test";
import "@testing-library/jest-dom";

const SOON_EVENT_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const LATER_EVENT_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";
const CALENDAR_ID = CalendarIdSchema.parse("cccccccccccccccccccccccc");
const CALENDAR: Calendar = {
  id: CALENDAR_ID,
  name: "Work",
  description: "",
  timeZone: TimeZoneSchema.parse("America/Denver"),
  foregroundColor: "#000000",
  backgroundColor: "#3b82f6",
  provider: "google",
  access: "owner",
  capabilities: getCalendarCapabilities("owner"),
  isPrimary: false,
  isVisible: true,
  isActive: true,
};

// Events are built relative to the real clock because the card's whole job is
// comparing today's events against "now".
const timedEvent = (
  id: string,
  title: string,
  startsInMinutes: number,
): Event => {
  const start = dayjs().add(startsInMinutes, "minute");
  return createMockEvent({
    id: EventIdSchema.parse(id),
    content: { kind: "details", title, description: "" },
    schedule: EventScheduleSchema.parse({
      kind: "timed",
      start: start.format(),
      end: start.add(30, "minute").format(),
      timeZone: "UTC",
    }),
  });
};

beforeEach(() => {
  draftActions.discard();
});

afterEach(() => {
  cleanup();
});

describe("formatStartsIn", () => {
  const now = dayjs("2026-05-20T09:00:00.000Z");
  const inMinutes = (minutes: number) => now.add(minutes, "minute");

  it("counts down in minutes below an hour", () => {
    expect(formatStartsIn(inMinutes(5), now)).toBe("Starts in 5 minutes");
  });

  it("uses the singular for one minute", () => {
    expect(formatStartsIn(inMinutes(1), now)).toBe("Starts in 1 minute");
  });

  it("rolls up to hours at an hour and beyond", () => {
    expect(formatStartsIn(inMinutes(60), now)).toBe("Starts in 1 hour");
    expect(formatStartsIn(inMinutes(120), now)).toBe("Starts in 2 hours");
  });

  it("reads 'Starts now' within the last half minute", () => {
    expect(formatStartsIn(now.add(20, "second"), now)).toBe("Starts now");
  });
});

describe("UpNextCard", () => {
  it("shows the soonest upcoming timed event left today", () => {
    render(<UpNextCard />, {
      events: [
        timedEvent(LATER_EVENT_ID, "Later Event", 90),
        timedEvent(SOON_EVENT_ID, "Soon Event", 30),
      ],
    });

    expect(screen.getByText("Soon Event")).toBeInTheDocument();
    expect(screen.getByText("Starts in 30 minutes")).toBeInTheDocument();
    expect(screen.queryByText("Later Event")).toBeNull();
    expect(screen.getByText("N")).toBeInTheDocument();
  });

  it("keeps its slot with an all-clear state when today has no upcoming timed events", () => {
    render(<UpNextCard />, {
      events: [
        // Already underway, so nothing is "up next".
        timedEvent(SOON_EVENT_ID, "Past Event", -30),
        createMockEvent({
          id: EventIdSchema.parse(LATER_EVENT_ID),
          content: { kind: "details", title: "All Day Event", description: "" },
          schedule: EventScheduleSchema.parse({
            kind: "allDay",
            start: dayjs().format("YYYY-MM-DD"),
            end: dayjs().add(1, "day").format("YYYY-MM-DD"),
          }),
        }),
      ],
    });

    expect(screen.getByRole("region", { name: "Up next" })).toBeInTheDocument();
    expect(screen.getByText("All clear")).toBeInTheDocument();
    expect(screen.queryByText("Past Event")).toBeNull();
    expect(screen.queryByText("All Day Event")).toBeNull();
    expect(screen.queryByRole("button", { name: /up next:/i })).toBeNull();
  });

  it("keeps its card while hiding the calendar with the only upcoming event", async () => {
    const queryClient = createCompassQueryClient();
    queryClient.setQueryData(calendarQueryKeys.all, [CALENDAR]);

    render(<UpNextCard />, {
      events: [
        createMockEvent({
          id: EventIdSchema.parse(SOON_EVENT_ID),
          calendarId: CALENDAR_ID,
          content: { kind: "details", title: "Soon Event", description: "" },
          schedule: EventScheduleSchema.parse({
            kind: "timed",
            start: dayjs().add(30, "minute").format(),
            end: dayjs().add(60, "minute").format(),
            timeZone: "UTC",
          }),
        }),
      ],
      queryClient,
    });

    expect(
      screen.getByRole("button", { name: /up next: soon event/i }),
    ).toBeInTheDocument();

    act(() => {
      expect(setCalendarVisibility(CALENDAR_ID, false)).toBe(true);
    });

    await waitFor(() => {
      expect(
        screen.getByRole("region", { name: "Up next" }),
      ).toBeInTheDocument();
      expect(screen.getByText("All clear")).toBeInTheDocument();
    });
  });

  it("opens the event's details in the sidebar when clicked", async () => {
    render(<UpNextCard />, {
      events: [timedEvent(SOON_EVENT_ID, "Soon Event", 30)],
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Up next: Soon Event/ }),
    );

    await waitFor(() => {
      const state = useDraftStore.getState();
      expect(state.status?.isFormOpen).toBe(true);
      expect(state.gridDraft?.source?.id).toBe(
        EventIdSchema.parse(SOON_EVENT_ID),
      );
    });
  });

  it("shows a Join link to the meeting when the event has a conference", () => {
    const start = dayjs().add(30, "minute");
    render(<UpNextCard />, {
      events: [
        createMockEvent({
          id: EventIdSchema.parse(SOON_EVENT_ID),
          content: {
            kind: "details",
            title: "Soon Event",
            description: "",
            conference: {
              url: "https://meet.google.com/abc-defg-hij",
              label: "Google Meet",
            },
          },
          schedule: EventScheduleSchema.parse({
            kind: "timed",
            start: start.format(),
            end: start.add(30, "minute").format(),
            timeZone: "UTC",
          }),
        }),
      ],
    });

    const link = screen.getByRole("link", { name: "Join" });
    expect(link).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText("V")).toBeInTheDocument();
    expect(screen.queryByText("N")).toBeNull();
  });

  it("shows no Join link when the event has no conference", () => {
    render(<UpNextCard />, {
      events: [timedEvent(SOON_EVENT_ID, "Soon Event", 30)],
    });

    expect(screen.queryByRole("link", { name: "Join" })).toBeNull();
    expect(screen.getByText("N")).toBeInTheDocument();
  });

  it("shows no Join link when the description only has a Notion URL", () => {
    const start = dayjs().add(30, "minute");
    render(<UpNextCard />, {
      events: [
        createMockEvent({
          id: EventIdSchema.parse(SOON_EVENT_ID),
          content: {
            kind: "details",
            title: "Update",
            description:
              "https://app.notion.com/p/alpaca-ty/Forever-Today-4e2d",
            conference: null,
          },
          schedule: EventScheduleSchema.parse({
            kind: "timed",
            start: start.format(),
            end: start.add(30, "minute").format(),
            timeZone: "UTC",
          }),
        }),
      ],
    });

    expect(screen.queryByRole("link", { name: "Join" })).toBeNull();
    expect(screen.getByText("N")).toBeInTheDocument();
  });
});

// A timed event that crosses midnight is projected into the all-day row with
// whole-calendar-day dates, so its endDate no longer says when it actually
// ends. The card has to read the real end off the source schedule, or every
// such event looks like it is still running until midnight. The clock is
// pinned because that projection only kicks in while "now" and "30 minutes
// ago" fall on different calendar days.
describe("UpNextCard across midnight", () => {
  const JUST_AFTER_MIDNIGHT = new Date("2026-08-06T00:13:00.000Z");

  afterEach(() => {
    setSystemTime();
  });

  it("stays all-clear for a midnight-spanning event that already ended", () => {
    setSystemTime(JUST_AFTER_MIDNIGHT);

    // 23:35 -> 00:05, so it crossed midnight and ended 8 minutes ago.
    render(<UpNextCard />, {
      events: [timedEvent(SOON_EVENT_ID, "Ended Event", -38)],
    });

    expect(screen.getByText("All clear")).toBeInTheDocument();
    expect(screen.queryByText("Ended Event")).toBeNull();
  });

  it("shows a midnight-spanning event that is still underway as Now", () => {
    setSystemTime(JUST_AFTER_MIDNIGHT);

    // 23:45 -> 00:15, so it crossed midnight and has 2 minutes left.
    render(<UpNextCard />, {
      events: [timedEvent(SOON_EVENT_ID, "Running Event", -28)],
    });

    expect(
      screen.getByRole("button", { name: /now: running event/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Running Event")).toBeInTheDocument();
    expect(screen.getByText("Now")).toBeInTheDocument();
  });
});
