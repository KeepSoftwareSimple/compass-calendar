import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type RefCallback } from "react";
import dayjs from "@core/util/date/dayjs";
import { afterEach, describe, expect, it, mock } from "bun:test";
import "@testing-library/jest-dom";
import { EventGrid, isEventGridLoading } from "./EventGrid";

const createGridRefs = () => ({
  allDayColumnsRef: { current: null },
  allDayRef: mock() as RefCallback<HTMLDivElement>,
  allDayRowRef: mock() as RefCallback<HTMLDivElement>,
  mainGridElementRef: mock() as RefCallback<HTMLDivElement>,
  mainGridRef: { current: null },
  timedColumnsElementRef: mock() as RefCallback<HTMLDivElement>,
  timedColumnsRef: { current: null },
});

const renderGrid = (count: number) =>
  render(
    <EventGrid
      allDayEventsLayer={<div data-testid="all-day-events-layer" />}
      gridRefs={createGridRefs()}
      timedEventsLayer={<div data-testid="timed-events-layer" />}
      today={dayjs("2026-05-20T00:00:00.000")}
      visibleDates={Array.from({ length: count }, (_, index) => ({
        date: dayjs("2026-05-18T00:00:00.000").add(index, "day"),
        key: `date-${index}`,
      }))}
    />,
  );

afterEach(() => {
  cleanup();
});

describe("EventGrid", () => {
  it("renders seven visible date columns for Week", () => {
    renderGrid(7);

    const timedGrid = screen.getByRole("region", { name: "Timed events grid" });
    expect(within(timedGrid).getAllByRole("columnheader")).toHaveLength(7);
  });

  it("renders one visible date column for Day", () => {
    renderGrid(1);

    const timedGrid = screen.getByRole("region", { name: "Timed events grid" });
    expect(within(timedGrid).getAllByRole("columnheader")).toHaveLength(1);
  });

  it("keeps explicit event layers on their surfaces", () => {
    renderGrid(1);

    expect(screen.getByRole("region", { name: "All-day events" })).toHaveClass(
      "bg-background",
    );
    expect(
      screen.getByRole("region", { name: "All-day events" }),
    ).toContainElement(screen.getByTestId("all-day-events-layer"));
    expect(
      screen.getByRole("region", { name: "Timed events grid" }),
    ).toContainElement(screen.getByTestId("timed-events-layer"));
  });

  it("shows a grid-wide focus indicator when the timed grid is focused", async () => {
    const user = userEvent.setup();

    render(
      <div>
        <button type="button">Before</button>
        <EventGrid
          allDayEventsLayer={<div />}
          gridRefs={createGridRefs()}
          timedEventsLayer={<div />}
          today={dayjs("2026-05-20T00:00:00.000")}
          visibleDates={[
            {
              date: dayjs("2026-05-20T00:00:00.000"),
              key: "date-0",
            },
          ]}
        />
      </div>,
    );

    await user.tab();
    await user.tab();

    const timedGrid = screen.getByRole("region", { name: "Timed events grid" });
    expect(timedGrid).toHaveFocus();

    const indicator = screen.getByTestId("grid-focus-indicator");
    expect(getComputedStyle(indicator).display).not.toBe("none");
  });

  it("passes the all-day row count to the shared all-day surface", () => {
    render(
      <EventGrid
        allDayEventsLayer={<div />}
        allDayGridOffsetTopPx={123}
        allDayRowsCount={3}
        gridRefs={createGridRefs()}
        timedEventsLayer={<div />}
        today={dayjs("2026-05-20T00:00:00.000")}
        visibleDates={[
          {
            date: dayjs("2026-05-20T00:00:00.000"),
            key: "date-0",
          },
        ]}
      />,
    );

    const allDayRow = screen.getByRole("region", { name: "All-day events" });
    expect(getComputedStyle(allDayRow).height).toContain("6 *");
    expect(getComputedStyle(allDayRow).minHeight).toBe("75px");
  });

  it("shows a couldn't-load state with retry when event fetch failed", async () => {
    const onRetryEvents = mock();
    const user = userEvent.setup();

    render(
      <EventGrid
        allDayEventsLayer={<div />}
        gridRefs={createGridRefs()}
        isErrorEvents
        onRetryEvents={onRetryEvents}
        timedEventsLayer={<div />}
        today={dayjs("2026-05-20T00:00:00.000")}
        visibleDates={[
          {
            date: dayjs("2026-05-20T00:00:00.000"),
            key: "date-0",
          },
        ]}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load events.");
    expect(alert.closest(".bg-background")).toBeTruthy();
    expect(
      within(alert.parentElement!).getByRole("button", { name: "Retry" }),
    ).toHaveClass("bg-accent");

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryEvents).toHaveBeenCalledTimes(1);
  });

  it("hides the error overlay while events are loading", () => {
    render(
      <EventGrid
        allDayEventsLayer={<div />}
        gridRefs={createGridRefs()}
        isErrorEvents
        isLoadingEvents
        timedEventsLayer={<div />}
        today={dayjs("2026-05-20T00:00:00.000")}
        visibleDates={[
          {
            date: dayjs("2026-05-20T00:00:00.000"),
            key: "date-0",
          },
        ]}
      />,
    );

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const loader = screen.getByRole("status", { name: "Loading events" });
    expect(loader).toBeInTheDocument();
    // Retry loading must block the grid (opaque overlay is not click-through).
    expect(loader).not.toHaveClass("pointer-events-none");
  });

  it("keeps first-load loader click-through and leaves grid chrome visible", () => {
    render(
      <EventGrid
        allDayEventsLayer={<div />}
        gridRefs={createGridRefs()}
        isLoadingEvents
        timedEventsLayer={<div />}
        today={dayjs("2026-05-20T00:00:00.000")}
        visibleDates={[
          {
            date: dayjs("2026-05-20T00:00:00.000"),
            key: "date-0",
          },
        ]}
      />,
    );

    const loader = screen.getByRole("status", { name: "Loading events" });
    expect(loader).toHaveClass("pointer-events-none");
    expect(loader).toHaveClass("backdrop-blur-none");
    expect(loader).not.toHaveClass("bg-background");
    // Chrome is already mounted under the non-blocking indicator.
    expect(
      screen.getByRole("region", { name: "Timed events grid" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "All-day events" }),
    ).toBeInTheDocument();
  });

  it("shows a scouting pirate when the visible range is empty during import", () => {
    render(
      <EventGrid
        allDayEventsLayer={<div />}
        gridRefs={createGridRefs()}
        isImportingEmpty
        timedEventsLayer={<div />}
        today={dayjs("2026-05-20T00:00:00.000")}
        visibleDates={[
          {
            date: dayjs("2026-05-20T00:00:00.000"),
            key: "date-0",
          },
        ]}
      />,
    );

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Adding your calendar…");
    expect(status).not.toHaveClass("sr-only");
    expect(
      screen.getByRole("img", {
        hidden: true,
        name: "Pixel pirate scouting with binoculars",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Importing from Google/i),
    ).not.toBeInTheDocument();
  });

  it("hides the scouting pirate while events are loading or in error", () => {
    const { rerender } = render(
      <EventGrid
        allDayEventsLayer={<div />}
        gridRefs={createGridRefs()}
        isImportingEmpty
        isLoadingEvents
        timedEventsLayer={<div />}
        today={dayjs("2026-05-20T00:00:00.000")}
        visibleDates={[
          {
            date: dayjs("2026-05-20T00:00:00.000"),
            key: "date-0",
          },
        ]}
      />,
    );

    expect(
      screen.queryByRole("status", { name: "Adding your calendar…" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Loading events" }),
    ).toBeInTheDocument();

    rerender(
      <EventGrid
        allDayEventsLayer={<div />}
        gridRefs={createGridRefs()}
        isErrorEvents
        isImportingEmpty
        timedEventsLayer={<div />}
        today={dayjs("2026-05-20T00:00:00.000")}
        visibleDates={[
          {
            date: dayjs("2026-05-20T00:00:00.000"),
            key: "date-0",
          },
        ]}
      />,
    );

    expect(screen.queryByText("Adding your calendar…")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load events.",
    );
  });

  it("shows a couldn't-add overlay with retry when the first import failed", async () => {
    const onRetryImport = mock();
    const user = userEvent.setup();

    render(
      <EventGrid
        allDayEventsLayer={<div />}
        gridRefs={createGridRefs()}
        isImportFailed
        onRetryImport={onRetryImport}
        timedEventsLayer={<div />}
        today={dayjs("2026-05-20T00:00:00.000")}
        visibleDates={[
          {
            date: dayjs("2026-05-20T00:00:00.000"),
            key: "date-0",
          },
        ]}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't add your calendar.",
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryImport).toHaveBeenCalledTimes(1);
  });

  it("shows the loader for first load and for retry after error", () => {
    expect(isEventGridLoading(true, false, false)).toBe(true);
    expect(isEventGridLoading(false, true, true)).toBe(true);
    expect(isEventGridLoading(false, true, false)).toBe(false);
    expect(isEventGridLoading(false, false, true)).toBe(false);
  });
});
