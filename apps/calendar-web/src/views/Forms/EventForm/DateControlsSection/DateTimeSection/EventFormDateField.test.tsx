import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { EventFormDateField } from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/EventFormDateField";
import { formatEventFormDateLabel } from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/eventFormDateField.util";
import { describe, expect, it, mock } from "bun:test";

const START = new Date("2026-10-13T12:00:00.000Z");

function Harness({ onCommit = mock() }: { onCommit?: (date: Date) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState(START);

  return (
    <EventFormDateField
      isOpen={isOpen}
      onCalendarClose={() => setIsOpen(false)}
      onCalendarOpen={() => setIsOpen(true)}
      onCommit={(date) => {
        onCommit(date);
        setSelected(date);
        setIsOpen(false);
      }}
      selected={selected}
      sideLabel="start"
      title="Pick Start Date"
    />
  );
}

function OpenHarness({
  onCalendarClose = mock(),
  onCommit = mock(),
}: {
  onCalendarClose?: () => void;
  onCommit?: (date: Date) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [selected, setSelected] = useState(START);

  return (
    <>
      <button type="button">Before</button>
      <EventFormDateField
        isOpen={isOpen}
        onCalendarClose={() => {
          onCalendarClose();
          setIsOpen(false);
        }}
        onCalendarOpen={() => setIsOpen(true)}
        onCommit={(date) => {
          onCommit(date);
          setSelected(date);
          setIsOpen(false);
        }}
        selected={selected}
        sideLabel="start"
        title="Pick Start Date"
      />
      <button type="button">After</button>
    </>
  );
}

describe("EventFormDateField", () => {
  it("shows compact MM.DD.YY labels when closed", () => {
    render(<Harness />);
    expect(screen.getByTitle("Pick Start Date")).toHaveValue(
      formatEventFormDateLabel(START),
    );
  });

  it("parses a typed numeric date on Enter", async () => {
    const user = userEvent.setup();
    const onCommit = mock();
    render(<Harness onCommit={onCommit} />);

    const input = screen.getByTitle("Pick Start Date");
    await user.click(input);
    await user.clear(input);
    await user.type(input, "10/15");
    await user.keyboard("{Enter}");

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]?.[0].getMonth()).toBe(9);
    expect(onCommit.mock.calls[0]?.[0].getDate()).toBe(15);
  });

  it("parses DD.MM.YY when the day is greater than 12", async () => {
    const user = userEvent.setup();
    const onCommit = mock();
    render(<Harness onCommit={onCommit} />);

    const input = screen.getByTitle("Pick Start Date");
    await user.click(input);
    await user.clear(input);
    await user.type(input, "17.10.26");
    await user.keyboard("{Enter}");

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]?.[0].getMonth()).toBe(9);
    expect(onCommit.mock.calls[0]?.[0].getDate()).toBe(17);
  });

  it("commits a typed date on Tab instead of discarding it", async () => {
    const user = userEvent.setup();
    const onCommit = mock();
    render(<Harness onCommit={onCommit} />);

    const input = screen.getByTitle("Pick Start Date");
    await user.click(input);
    await user.clear(input);
    await user.type(input, "10.20.26");
    await user.tab();

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]?.[0].getDate()).toBe(20);
  });

  it("commits a typed date when focus leaves the field", async () => {
    const user = userEvent.setup();
    const onCommit = mock();
    render(
      <>
        <Harness onCommit={onCommit} />
        <button type="button">Elsewhere</button>
      </>,
    );

    const input = screen.getByTitle("Pick Start Date");
    await user.click(input);
    await user.clear(input);
    await user.type(input, "10.21.26");
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]?.[0].getDate()).toBe(21);
  });

  it("restores the date when Enter is pressed on an empty field", async () => {
    const user = userEvent.setup();
    const onCommit = mock();
    render(<Harness onCommit={onCommit} />);

    const input = screen.getByTitle("Pick Start Date");
    await user.click(input);
    await user.clear(input);
    await user.keyboard("{Escape}");
    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      input.focus();
    });
    await user.keyboard("{Enter}");

    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue(formatEventFormDateLabel(START));
  });

  it("nudges one day with arrow keys when the calendar is closed", async () => {
    const user = userEvent.setup();
    const onCommit = mock();
    render(<Harness onCommit={onCommit} />);

    const input = screen.getByTitle("Pick Start Date");
    input.focus();
    await user.keyboard("{ArrowUp}");

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]?.[0].getDate()).toBe(12);
  });

  it("opens the calendar on Enter when the committed date is unchanged", async () => {
    const user = userEvent.setup();
    const onCalendarOpen = mock();
    render(
      <EventFormDateField
        isOpen={false}
        onCalendarClose={() => undefined}
        onCalendarOpen={onCalendarOpen}
        onCommit={() => undefined}
        selected={START}
        sideLabel="start"
        title="Pick Start Date"
      />,
    );

    const input = screen.getByTitle("Pick Start Date");
    input.focus();
    await user.keyboard("{Enter}");

    expect(onCalendarOpen).toHaveBeenCalledTimes(1);
  });

  it("opens the calendar on Space when showing the committed date", async () => {
    const user = userEvent.setup();
    const onCalendarOpen = mock();
    render(
      <EventFormDateField
        isOpen={false}
        onCalendarClose={() => undefined}
        onCalendarOpen={onCalendarOpen}
        onCommit={() => undefined}
        selected={START}
        sideLabel="start"
        title="Pick Start Date"
      />,
    );

    screen.getByTitle("Pick Start Date").focus();
    await user.keyboard(" ");

    expect(onCalendarOpen).toHaveBeenCalledTimes(1);
  });

  it("does not open the calendar on Space while typing a new date", async () => {
    const user = userEvent.setup();
    const onCalendarOpen = mock();
    render(
      <EventFormDateField
        isOpen={false}
        onCalendarClose={() => undefined}
        onCalendarOpen={onCalendarOpen}
        onCommit={() => undefined}
        selected={START}
        sideLabel="start"
        title="Pick Start Date"
      />,
    );

    const input = screen.getByTitle("Pick Start Date");
    input.focus();
    await user.clear(input);
    await user.type(input, "10");
    onCalendarOpen.mockClear();
    await user.keyboard(" ");

    expect(onCalendarOpen).not.toHaveBeenCalled();
    expect(input).toHaveValue("10 ");
  });

  it("returns focus to the input when Escape closes the calendar", async () => {
    const user = userEvent.setup();
    const onCalendarClose = mock();
    render(
      <EventFormDateField
        isOpen
        onCalendarClose={onCalendarClose}
        onCalendarOpen={() => undefined}
        onCommit={() => undefined}
        selected={START}
        sideLabel="start"
        title="Pick Start Date"
      />,
    );

    const input = screen.getByTitle("Pick Start Date");
    input.focus();
    await user.keyboard("{Escape}");

    expect(onCalendarClose).toHaveBeenCalledTimes(1);
    expect(input).toHaveFocus();
  });

  it("is reachable in tab order between surrounding controls", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before</button>
        <EventFormDateField
          inputId="eventFormStartDate"
          isOpen={false}
          onCalendarClose={() => undefined}
          onCalendarOpen={() => undefined}
          onCommit={() => undefined}
          selected={START}
          sideLabel="start"
          title="Pick Start Date"
        />
        <button type="button">After</button>
      </>,
    );

    const wrapper = document.getElementById("eventFormStartDate");
    expect(wrapper?.tabIndex).toBe(-1);
    expect(screen.getByTitle("Pick Start Date")).not.toHaveAttribute(
      "tabindex",
      "-1",
    );

    screen.getByRole("button", { name: "Before" }).focus();
    await user.tab();
    expect(screen.getByTitle("Pick Start Date")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  });

  it("shows an in-field ArrowDown keycap while the input is focused", () => {
    render(<Harness />);

    const input = screen.getByTitle("Pick Start Date");
    act(() => {
      input.focus();
    });

    const hint = screen.getByTestId("event-form-control-hint");
    expect(hint.querySelector(".c-keycap")).toBeTruthy();
    expect(hint.className).toMatch(/right-1\.5/);
  });

  it("shows calendar navigation keycaps in the popover header when open", () => {
    render(
      <EventFormDateField
        isOpen
        onCalendarClose={() => undefined}
        onCalendarOpen={() => undefined}
        onCommit={() => undefined}
        selected={START}
        sideLabel="start"
        title="Pick Start Date"
      />,
    );

    expect(screen.getByTestId("event-form-calendar-hint")).toBeInTheDocument();
    expect(
      screen.queryByTestId("event-form-control-hint"),
    ).not.toBeInTheDocument();
    const hintRow = screen.getByTestId("event-form-calendar-hint");
    expect(hintRow.className).toMatch(/flex-wrap/);
    expect(hintRow.closest(".react-datepicker__header")?.children.length).toBe(
      2,
    );
  });

  it("moves focus into the grid on ArrowDown and steps by day and week", async () => {
    const user = userEvent.setup();
    render(
      <EventFormDateField
        isOpen
        onCalendarClose={() => undefined}
        onCalendarOpen={() => undefined}
        onCommit={() => undefined}
        selected={START}
        sideLabel="start"
        title="Pick Start Date"
      />,
    );

    const input = screen.getByTitle("Pick Start Date");
    input.focus();
    await user.keyboard("{ArrowDown}");

    const highlighted = document.querySelector(
      ".react-datepicker__day--keyboard-selected",
    );
    expect(highlighted?.textContent?.trim()).toBe("13");
    await waitFor(() => {
      expect(highlighted).toHaveFocus();
    });

    await user.keyboard("{ArrowRight}");
    expect(
      document
        .querySelector(".react-datepicker__day--keyboard-selected")
        ?.textContent?.trim(),
    ).toBe("14");

    await user.keyboard("{ArrowDown}");
    expect(
      document
        .querySelector(".react-datepicker__day--keyboard-selected")
        ?.textContent?.trim(),
    ).toBe("21");
  });

  it("changes the displayed month when arrow keys cross a boundary", async () => {
    const user = userEvent.setup();
    render(
      <EventFormDateField
        isOpen
        onCalendarClose={() => undefined}
        onCalendarOpen={() => undefined}
        onCommit={() => undefined}
        selected={new Date("2026-10-31T12:00:00.000Z")}
        sideLabel="start"
        title="Pick Start Date"
      />,
    );

    const input = screen.getByTitle("Pick Start Date");
    input.focus();
    await user.keyboard("{ArrowDown}{ArrowRight}");

    expect(screen.getByText("Nov 2026")).toBeInTheDocument();
    expect(
      document
        .querySelector(".react-datepicker__day--keyboard-selected")
        ?.textContent?.trim(),
    ).toBe("1");
  });

  it("closes the calendar on Tab without trapping focus", async () => {
    const user = userEvent.setup();
    const onCalendarClose = mock();
    render(<OpenHarness onCalendarClose={onCalendarClose} />);

    const input = screen.getByTitle("Pick Start Date");
    input.focus();
    await user.tab();

    expect(onCalendarClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".react-datepicker")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
  });

  it("closes the calendar on Shift+Tab without trapping focus", async () => {
    const user = userEvent.setup();
    const onCalendarClose = mock();
    render(<OpenHarness onCalendarClose={onCalendarClose} />);

    const input = screen.getByTitle("Pick Start Date");
    input.focus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");

    expect(onCalendarClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".react-datepicker")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Before" })).toHaveFocus();
  });

  it("keeps Left and Right editing the input text before the grid is focused", async () => {
    const user = userEvent.setup();
    render(
      <EventFormDateField
        isOpen
        onCalendarClose={() => undefined}
        onCalendarOpen={() => undefined}
        onCommit={() => undefined}
        selected={START}
        sideLabel="start"
        title="Pick Start Date"
      />,
    );

    const input = screen.getByTitle("Pick Start Date");
    input.focus();
    await user.keyboard("{ArrowLeft}");

    expect(input).toHaveFocus();
    expect(
      document.querySelector(".react-datepicker__day--keyboard-selected"),
    ).toBeNull();
  });

  it("selects the highlighted day on Enter without submitting through the form", async () => {
    const user = userEvent.setup();
    const onCommit = mock();
    const onCalendarClose = mock();
    render(
      <EventFormDateField
        isOpen
        onCalendarClose={onCalendarClose}
        onCalendarOpen={() => undefined}
        onCommit={onCommit}
        selected={START}
        sideLabel="start"
        title="Pick Start Date"
      />,
    );

    const input = screen.getByTitle("Pick Start Date");
    input.focus();
    await user.keyboard("{ArrowDown}{ArrowRight}{Enter}");

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]?.[0].getDate()).toBe(14);
    expect(onCalendarClose).toHaveBeenCalledTimes(1);
  });

  it("opens the calendar on a bare ArrowDown", async () => {
    const user = userEvent.setup();
    const onCalendarOpen = mock();
    render(
      <EventFormDateField
        isOpen={false}
        onCalendarClose={() => undefined}
        onCalendarOpen={onCalendarOpen}
        onCommit={() => undefined}
        selected={START}
        sideLabel="start"
        title="Pick Start Date"
      />,
    );

    screen.getByTitle("Pick Start Date").focus();
    await user.keyboard("{ArrowDown}");

    expect(onCalendarOpen).toHaveBeenCalledTimes(1);
  });
});
