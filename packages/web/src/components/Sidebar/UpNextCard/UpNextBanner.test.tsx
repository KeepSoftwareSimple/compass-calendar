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
import { draftActions, useDraftStore } from "@web/events/stores/draft.store";
import { UpNextBanner } from "./UpNextBanner";
import { useUpNextAvailabilityStore } from "./up-next.availability.store";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import "@testing-library/jest-dom";

const SOON_EVENT_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const LATER_EVENT_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";

// Events are built relative to the real clock because the banner's whole job
// is comparing today's events against "now".
const timedEvent = (
  id: string,
  title: string,
  startsInMinutes: number,
  conference?: { url: string; label: string | null },
): Event => {
  const start = dayjs().add(startsInMinutes, "minute");
  return createMockEvent({
    id: EventIdSchema.parse(id),
    content: {
      kind: "details",
      title,
      description: "",
      ...(conference ? { conference } : {}),
    },
    schedule: EventScheduleSchema.parse({
      kind: "timed",
      start: start.format(),
      end: start.add(30, "minute").format(),
      timeZone: "UTC",
    }),
  });
};

const mockWindowOpen = mock();

beforeEach(() => {
  draftActions.discard();
  mockWindowOpen.mockClear();
  window.open = mockWindowOpen;
});

afterEach(() => {
  cleanup();
});

describe("UpNextBanner", () => {
  it("shows a countdown and Open action for an event within 2 minutes", () => {
    render(<UpNextBanner />, {
      events: [timedEvent(SOON_EVENT_ID, "Soon Event", 2)],
    });

    expect(screen.getByText("Starts in 2 minutes")).toBeInTheDocument();
    expect(screen.getByText("Soon Event")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
    expect(screen.getByText("N")).toBeInTheDocument();
  });

  it("publishes availability so the palette can enable Up Next without querying", async () => {
    render(<UpNextBanner />, {
      events: [
        timedEvent(SOON_EVENT_ID, "Soon Event", 2, {
          url: "https://meet.google.com/abc-defg-hij",
          label: null,
        }),
      ],
    });

    await waitFor(() => {
      const snapshot = useUpNextAvailabilityStore.getState();
      expect(snapshot.hasUpNext).toBe(true);
      expect(snapshot.hasConference).toBe(true);
    });
  });

  it("renders nothing for an event more than 2 minutes out", () => {
    render(<UpNextBanner />, {
      events: [timedEvent(LATER_EVENT_ID, "Later Event", 30)],
    });

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows Open and N when the description only has a Notion URL", () => {
    const start = dayjs().add(2, "minute");
    render(<UpNextBanner />, {
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

    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
    expect(screen.getByText("N")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join" })).toBeNull();
    expect(screen.queryByText("V")).toBeNull();
  });

  it("shows Join and V when the meeting link lives only in the description", () => {
    const start = dayjs().add(2, "minute");
    render(<UpNextBanner />, {
      events: [
        createMockEvent({
          id: EventIdSchema.parse(SOON_EVENT_ID),
          content: {
            kind: "details",
            title: "Standup",
            description:
              'Join <a href="https://zoom.us/j/123456789">Zoom</a> from the invite.',
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

    expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
    expect(screen.getByText("V")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();
  });

  it("shows a Join action with the meeting link instead of Open", () => {
    render(<UpNextBanner />, {
      events: [
        timedEvent(SOON_EVENT_ID, "Standup", 2, {
          url: "https://meet.google.com/abc-defg-hij",
          label: null,
        }),
      ],
    });

    const joinButton = screen.getByRole("button", { name: "Join" });
    expect(joinButton).toBeInTheDocument();
    expect(screen.getByText("V")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open" })).toBeNull();

    fireEvent.click(joinButton);

    expect(mockWindowOpen).toHaveBeenCalledWith(
      "https://meet.google.com/abc-defg-hij",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("pressing v opens the meeting link", async () => {
    const user = userEvent.setup();
    render(<UpNextBanner />, {
      events: [
        timedEvent(SOON_EVENT_ID, "Standup", 2, {
          url: "https://meet.google.com/abc-defg-hij",
          label: null,
        }),
      ],
    });

    await user.keyboard("v");

    expect(mockWindowOpen).toHaveBeenCalledWith(
      "https://meet.google.com/abc-defg-hij",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("pressing v opens the meeting link when the banner is not showing", async () => {
    const user = userEvent.setup();
    render(<UpNextBanner />, {
      events: [
        timedEvent(LATER_EVENT_ID, "Later Standup", 30, {
          url: "https://meet.google.com/abc-defg-hij",
          label: null,
        }),
      ],
    });

    expect(screen.queryByRole("status")).toBeNull();

    await user.keyboard("v");

    expect(mockWindowOpen).toHaveBeenCalledWith(
      "https://meet.google.com/abc-defg-hij",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("pressing n opens the event details form even when Join is shown", async () => {
    const user = userEvent.setup();
    render(<UpNextBanner />, {
      events: [
        timedEvent(SOON_EVENT_ID, "Standup", 2, {
          url: "https://meet.google.com/abc-defg-hij",
          label: null,
        }),
      ],
    });

    await user.keyboard("n");

    await waitFor(() => {
      const state = useDraftStore.getState();
      expect(state.status?.isFormOpen).toBe(true);
      expect(state.status?.activity).toBe("keyboardEdit");
      expect(state.gridDraft?.source?.id).toBe(
        EventIdSchema.parse(SOON_EVENT_ID),
      );
    });
  });

  it("clicking Open opens the event details form", async () => {
    render(<UpNextBanner />, {
      events: [timedEvent(SOON_EVENT_ID, "Soon Event", 2)],
    });

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      const state = useDraftStore.getState();
      expect(state.status?.isFormOpen).toBe(true);
      expect(state.gridDraft?.source?.id).toBe(
        EventIdSchema.parse(SOON_EVENT_ID),
      );
    });
  });

  it("dismissing fades the banner out, then hides it for that event", async () => {
    render(<UpNextBanner />, {
      events: [timedEvent(SOON_EVENT_ID, "Soon Event", 2)],
    });

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    // Stays mounted for the fade-out beat rather than vanishing instantly.
    expect(screen.getByRole("status")).toHaveAttribute("data-closing");

    await waitFor(() => {
      expect(screen.queryByText("Soon Event")).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  it("pressing Escape dismisses the banner", async () => {
    const user = userEvent.setup();
    render(<UpNextBanner />, {
      events: [timedEvent(SOON_EVENT_ID, "Soon Event", 2)],
    });

    expect(screen.getByText("Soon Event")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByText("Soon Event")).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
    });
  });
});
