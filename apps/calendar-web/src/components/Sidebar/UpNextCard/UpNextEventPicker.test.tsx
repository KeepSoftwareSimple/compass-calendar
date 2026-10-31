import userEvent from "@testing-library/user-event";
import { EventIdSchema } from "@core/types/domain-primitives";
import { type Event, EventScheduleSchema } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@web/__tests__/__mocks__/mock.render";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { draftActions } from "@web/events/stores/draft.store";
import { UpNextEventPicker } from "./UpNextEventPicker";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import "@testing-library/jest-dom";

const EVENT_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const EVENT_B = "bbbbbbbbbbbbbbbbbbbbbbbb";

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

const rows = [
  {
    id: EVENT_A,
    title: "Devotion",
    startDate: dayjs().add(1, "minute").format(),
    endDate: dayjs().add(31, "minute").format(),
    hasMeetingLink: true,
  },
  {
    id: EVENT_B,
    title: "Standup",
    startDate: dayjs().add(2, "minute").format(),
    endDate: dayjs().add(32, "minute").format(),
    hasMeetingLink: false,
  },
];

describe("UpNextEventPicker", () => {
  const onSelect = mock();
  const onClose = mock();

  beforeEach(() => {
    draftActions.discard();
    onSelect.mockClear();
    onClose.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("lists events with digit hints and opens the chosen row", async () => {
    const user = userEvent.setup();
    render(
      <UpNextEventPicker
        hasCurrentEvent={false}
        onClose={onClose}
        onSelect={onSelect}
        rows={rows}
      />,
      {
        events: [
          timedEvent(EVENT_A, "Devotion", 1),
          timedEvent(EVENT_B, "Standup", 2),
        ],
      },
    );

    expect(
      screen.getByText(
        "You have 2 upcoming events. Select which event to open",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Devotion")).toBeInTheDocument();
    expect(screen.getByText("Standup")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    await user.keyboard("2");

    expect(onSelect).toHaveBeenCalledWith(EVENT_B);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(
      <UpNextEventPicker
        hasCurrentEvent={false}
        onClose={onClose}
        onSelect={onSelect}
        rows={rows}
      />,
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("opens the highlighted row on Enter after arrow navigation", async () => {
    const user = userEvent.setup();
    render(
      <UpNextEventPicker
        hasCurrentEvent={false}
        onClose={onClose}
        onSelect={onSelect}
        rows={rows}
      />,
    );

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith(EVENT_B);
  });

  it("opens a row from a click", async () => {
    render(
      <UpNextEventPicker
        hasCurrentEvent={true}
        onClose={onClose}
        onSelect={onSelect}
        rows={rows}
      />,
    );

    fireEvent.click(screen.getByRole("option", { name: /Devotion/i }));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(EVENT_A);
    });
  });
});
