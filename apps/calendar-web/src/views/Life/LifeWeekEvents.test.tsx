import { EventIdSchema } from "@core/types/domain-primitives";
import { type Event, EventScheduleSchema } from "@core/types/event.contracts";
import { cleanup, render, screen } from "@web/__tests__/__mocks__/mock.render";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { seedHiddenEventIds } from "@web/__tests__/utils/hidden-events-test-data";
import { createCompassQueryClient } from "@web/api/query-client";
import { LifeWeekEvents } from "./LifeWeekEvents";
import { afterEach, describe, expect, it } from "bun:test";
import "@testing-library/jest-dom";

const VISIBLE_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const HIDDEN_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";
/** The Sunday the life grid hands the preview as its week anchor. */
const WEEK_START = "2026-05-17";

const timedEvent = (id: string, title: string, day: string): Event =>
  createMockEvent({
    id: EventIdSchema.parse(id),
    content: { kind: "details", title, description: "" },
    schedule: EventScheduleSchema.parse({
      kind: "timed",
      start: `${day}T17:00:00.000Z`,
      end: `${day}T18:00:00.000Z`,
      timeZone: "UTC",
    }),
  });

afterEach(() => {
  cleanup();
});

describe("LifeWeekEvents", () => {
  it("lists the week's events", () => {
    render(<LifeWeekEvents date={WEEK_START} />, {
      events: [timedEvent(VISIBLE_ID, "Dinner with Jo", "2026-05-19")],
    });

    expect(
      screen.getByRole("list", { name: "Events this week" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Dinner with Jo")).toBeInTheDocument();
  });

  it("leaves out an event the user hid", () => {
    const queryClient = createCompassQueryClient();
    seedHiddenEventIds(queryClient, [HIDDEN_ID]);

    render(<LifeWeekEvents date={WEEK_START} />, {
      events: [
        timedEvent(VISIBLE_ID, "Dinner with Jo", "2026-05-19"),
        timedEvent(HIDDEN_ID, "Flight to Chicago", "2026-05-20"),
      ],
      queryClient,
    });

    expect(screen.getByText("Dinner with Jo")).toBeInTheDocument();
    expect(screen.queryByText("Flight to Chicago")).toBeNull();
  });
});
