import {
  HotkeyManager,
  HotkeysProvider,
  resolveModifier,
} from "@tanstack/react-hotkeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act, type PropsWithChildren, type ReactElement } from "react";
import dayjs from "@core/util/date/dayjs";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { MonthPicker } from "@web/components/Sidebar/MonthPicker/MonthPicker";
import {
  pageJumpHintActions,
  usePageJumpHintStore,
} from "@web/shortcuts/page-jump/page-jump.store";
import { MONTH_PICKER_IN_VIEW_CLASS } from "./monthPickerDayClassName";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const getTabStopDay = () =>
  document.querySelector<HTMLElement>('.react-datepicker__day[tabindex="0"]');

const dayNamed = (label: string) => screen.getByLabelText(label);

// The header's TrialBadge reads billing status through react-query, so the
// picker needs a client the way it does in the real app, on top of the
// hotkeys provider the month chords already required.
const wrapper = ({ children }: PropsWithChildren) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <HotkeysProvider>{children}</HotkeysProvider>
  </QueryClientProvider>
);

const renderPicker = (ui: ReactElement) => render(ui, { wrapper });

const isMac = resolveModifier("Mod") === "Meta";
const pressMonthChord = (key: string) => {
  const init = isMac
    ? { metaKey: true, shiftKey: true }
    : { ctrlKey: true, shiftKey: true };
  pressKey(key, { keyDownInit: init, keyUpInit: init });
};

const pickerProps = {
  selectedDate: dayjs("2026-05-18"),
  viewEnd: dayjs("2026-05-23"),
  viewStart: dayjs("2026-05-17"),
} as const;

beforeEach(() => {
  HotkeyManager.resetInstance();
});

afterEach(() => {
  cleanup();
  pageJumpHintActions.reset();
});

describe("MonthPicker", () => {
  it("ignores day clicks and marks the picker as a pointer-teaching target", async () => {
    const user = userEvent.setup({ skipHover: true });
    const onSelectDate = mock();

    renderPicker(<MonthPicker onSelectDate={onSelectDate} {...pickerProps} />);

    await user.click(dayNamed("Choose Monday, May 25th, 2026"));

    expect(onSelectDate).not.toHaveBeenCalled();
    expect(dayNamed("Choose Monday, May 25th, 2026")).not.toHaveFocus();
    expect(
      screen.getByRole("group", { name: "Date navigation" }),
    ).toBeInTheDocument();
  });

  it("marks the calendar as using theme text so day numbers follow --text", () => {
    renderPicker(<MonthPicker onSelectDate={mock()} {...pickerProps} />);

    expect(document.querySelector(".c-date-picker")).toHaveAttribute(
      "data-dark",
      "true",
    );
  });

  it("moves a week at a time with every arrow key and opens the week with Enter", async () => {
    const user = userEvent.setup({ skipHover: true });
    const onSelectDate = mock();
    renderPicker(<MonthPicker onSelectDate={onSelectDate} {...pickerProps} />);

    const picker = screen.getByRole("group", { name: "Date navigation" });
    expect(picker).toHaveAttribute("data-picker-unit", "week");

    // The only tab stop is the start of the cursor week (Sunday-first view).
    const tabStop = getTabStopDay();
    expect(tabStop?.getAttribute("aria-label")).toBe(
      "Choose Sunday, May 17th, 2026",
    );
    act(() => tabStop?.focus());

    await user.keyboard("{ArrowDown}");
    await waitFor(() => {
      expect(dayNamed("Choose Sunday, May 24th, 2026")).toHaveFocus();
    });
    expect(
      dayNamed("Choose Sunday, May 24th, 2026").closest(
        ".react-datepicker__week",
      ),
    ).toHaveClass("react-datepicker__week--keyboard-selected");

    await user.keyboard("{ArrowRight}");
    await waitFor(() => {
      expect(dayNamed("Choose Sunday, May 31st, 2026")).toHaveFocus();
    });

    await user.keyboard("{ArrowLeft}{ArrowUp}");
    await waitFor(() => {
      expect(dayNamed("Choose Sunday, May 17th, 2026")).toHaveFocus();
    });

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelectDate).toHaveBeenCalledTimes(1);
    expect(onSelectDate.mock.calls[0]?.[0].format("YYYY-MM-DD")).toBe(
      "2026-05-24",
    );
    expect(
      dayNamed("Choose Sunday, May 24th, 2026").closest(
        ".react-datepicker__week",
      ),
    ).toHaveClass("react-datepicker__week--selected");
  });

  it("anchors the cursor week on Monday when the view starts Monday", async () => {
    const user = userEvent.setup({ skipHover: true });
    const onSelectDate = mock();
    renderPicker(
      <MonthPicker
        onSelectDate={onSelectDate}
        selectedDate={dayjs("2026-05-13")}
        viewEnd={dayjs("2026-05-17")}
        viewStart={dayjs("2026-05-11")}
      />,
    );

    const tabStop = getTabStopDay();
    expect(tabStop?.getAttribute("aria-label")).toBe(
      "Choose Monday, May 11th, 2026",
    );
    act(() => tabStop?.focus());

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onSelectDate.mock.calls[0]?.[0].format("YYYY-MM-DD")).toBe(
      "2026-05-18",
    );
  });

  it("steps by day for a single-day window", async () => {
    const user = userEvent.setup({ skipHover: true });
    const onSelectDate = mock();
    renderPicker(
      <MonthPicker
        onSelectDate={onSelectDate}
        selectedDate={dayjs("2026-05-13")}
        viewEnd={dayjs("2026-05-13")}
        viewStart={dayjs("2026-05-13")}
      />,
    );

    expect(
      screen.getByRole("group", { name: "Date navigation" }),
    ).toHaveAttribute("data-picker-unit", "day");
    const tabStop = getTabStopDay();
    expect(tabStop?.getAttribute("aria-label")).toBe(
      "Choose Wednesday, May 13th, 2026",
    );
    act(() => tabStop?.focus());

    await user.keyboard("{ArrowRight}");
    await waitFor(() => {
      expect(dayNamed("Choose Thursday, May 14th, 2026")).toHaveFocus();
    });

    await user.keyboard("{Enter}");
    expect(onSelectDate.mock.calls[0]?.[0].format("YYYY-MM-DD")).toBe(
      "2026-05-14",
    );
  });

  it("keeps focus on a day in the new month after a month chord", async () => {
    renderPicker(<MonthPicker onSelectDate={mock()} {...pickerProps} />);

    act(() => getTabStopDay()?.focus());
    act(() => {
      pressMonthChord(".");
    });

    await waitFor(() => {
      expect(screen.getByText("Jun 2026")).toBeInTheDocument();
    });
    const tabStop = getTabStopDay();
    expect(tabStop?.getAttribute("aria-label")).toContain("June");
    expect(tabStop).toHaveFocus();
  });

  it("leaves outside focus alone on a month chord but still provides a tab stop", async () => {
    renderPicker(<MonthPicker onSelectDate={mock()} {...pickerProps} />);
    expect(document.activeElement).toBe(document.body);

    act(() => {
      pressMonthChord(".");
    });

    await waitFor(() => {
      expect(screen.getByText("Jun 2026")).toBeInTheDocument();
    });
    expect(document.activeElement).toBe(document.body);
    expect(getTabStopDay()?.getAttribute("aria-label")).toContain("June");
  });

  it("keeps focus on the chevron after a keyboard month change", async () => {
    const user = userEvent.setup({ skipHover: true });
    renderPicker(<MonthPicker onSelectDate={mock()} {...pickerProps} />);

    const next = screen.getByRole("button", { name: "Next month" });
    act(() => next.focus());
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByText("Jun 2026")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Next month" })).toHaveFocus();
    expect(getTabStopDay()?.getAttribute("aria-label")).toContain("June");
  });

  it("re-anchors the tab stop when chording back to the cursor's month after arrowing away", async () => {
    const user = userEvent.setup({ skipHover: true });
    renderPicker(<MonthPicker onSelectDate={mock()} {...pickerProps} />);

    act(() => getTabStopDay()?.focus());
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    await waitFor(() => {
      expect(screen.getByText("Jun 2026")).toBeInTheDocument();
    });

    act(() => {
      pressMonthChord(",");
    });

    await waitFor(() => {
      expect(screen.getByText("May 2026")).toBeInTheDocument();
    });
    const tabStop = getTabStopDay();
    expect(tabStop?.getAttribute("aria-label")).toContain("May");
    expect(tabStop).toHaveFocus();
  });

  it("teaches the focus key first, then arrow icons, then Enter", async () => {
    const user = userEvent.setup({ skipHover: true });
    renderPicker(<MonthPicker onSelectDate={mock()} {...pickerProps} />);
    const picker = screen.getByRole("group", { name: "Date navigation" });
    expect(picker).toHaveTextContent("I focuses the picker");
    expect(picker).not.toHaveTextContent("Arrows");
    expect(picker).not.toHaveTextContent("move by week");
    expect(picker).not.toHaveTextContent("opens it");

    act(() => getTabStopDay()?.focus());
    expect(picker).toHaveTextContent("move by week");
    expect(picker).not.toHaveTextContent("focuses the picker");
    expect(picker).not.toHaveTextContent("Arrows");
    expect(picker.querySelector("[data-testid='arrowup-icon']")).not.toBeNull();
    expect(
      picker.querySelector("[data-testid='arrowdown-icon']"),
    ).not.toBeNull();
    expect(picker).not.toHaveTextContent("opens it");

    await user.keyboard("{ArrowDown}");
    expect(picker).toHaveTextContent("Enter");
    expect(picker).toHaveTextContent("opens it");
    const enterKeycap = [
      ...picker.querySelectorAll("[aria-hidden='true']"),
    ].find((node) => node.textContent === "Enter");
    expect(enterKeycap?.className).toContain("c-keycap");
  });

  it("names the day unit once the picker is focused", () => {
    renderPicker(
      <MonthPicker
        onSelectDate={mock()}
        selectedDate={dayjs("2026-05-13")}
        viewEnd={dayjs("2026-05-13")}
        viewStart={dayjs("2026-05-13")}
      />,
    );
    const picker = screen.getByRole("group", { name: "Date navigation" });
    expect(picker).toHaveTextContent("I focuses the picker");

    act(() => getTabStopDay()?.focus());
    expect(picker).toHaveTextContent("move by day");
    expect(picker).not.toHaveTextContent("opens it");
  });

  it("highlights the visible Sun-Sat window, not adjacent days", () => {
    renderPicker(
      <MonthPicker
        onSelectDate={mock()}
        selectedDate={dayjs("2026-05-13")}
        viewEnd={dayjs("2026-05-16")}
        viewStart={dayjs("2026-05-10")}
      />,
    );

    expect(dayNamed("Choose Sunday, May 10th, 2026")).toHaveClass(
      MONTH_PICKER_IN_VIEW_CLASS,
    );
    expect(dayNamed("Choose Saturday, May 16th, 2026")).toHaveClass(
      MONTH_PICKER_IN_VIEW_CLASS,
    );
    expect(dayNamed("Choose Saturday, May 9th, 2026")).not.toHaveClass(
      MONTH_PICKER_IN_VIEW_CLASS,
    );
    expect(dayNamed("Choose Sunday, May 17th, 2026")).not.toHaveClass(
      MONTH_PICKER_IN_VIEW_CLASS,
    );
  });

  it("moves the in-view band when the visible window shifts while selection stays", () => {
    const { rerender } = renderPicker(
      <MonthPicker
        onSelectDate={mock()}
        selectedDate={dayjs("2026-05-13")}
        viewEnd={dayjs("2026-05-16")}
        viewStart={dayjs("2026-05-10")}
      />,
    );

    expect(dayNamed("Choose Wednesday, May 13th, 2026")).toHaveClass(
      "react-datepicker__day--selected",
    );

    rerender(
      <MonthPicker
        onSelectDate={mock()}
        selectedDate={dayjs("2026-05-13")}
        viewEnd={dayjs("2026-05-17")}
        viewStart={dayjs("2026-05-11")}
      />,
    );

    expect(dayNamed("Choose Saturday, May 9th, 2026")).not.toHaveClass(
      MONTH_PICKER_IN_VIEW_CLASS,
    );
    expect(dayNamed("Choose Sunday, May 10th, 2026")).not.toHaveClass(
      MONTH_PICKER_IN_VIEW_CLASS,
    );
    expect(dayNamed("Choose Monday, May 11th, 2026")).toHaveClass(
      MONTH_PICKER_IN_VIEW_CLASS,
    );
    expect(dayNamed("Choose Sunday, May 17th, 2026")).toHaveClass(
      MONTH_PICKER_IN_VIEW_CLASS,
    );
    expect(dayNamed("Choose Wednesday, May 13th, 2026")).toHaveClass(
      "react-datepicker__day--selected",
    );
  });

  it("starts weekday columns on Monday when the week view starts Monday", () => {
    renderPicker(
      <MonthPicker
        onSelectDate={mock()}
        selectedDate={dayjs("2026-05-13")}
        viewEnd={dayjs("2026-05-17")}
        viewStart={dayjs("2026-05-11")}
      />,
    );

    const weekdayHeaders = screen
      .getByRole("group", { name: "Date navigation" })
      .querySelectorAll(".react-datepicker__day-name");
    expect([...weekdayHeaders].map((header) => header.textContent)).toEqual([
      "M",
      "T",
      "W",
      "T",
      "F",
      "S",
      "S",
    ]);

    const monday = dayNamed("Choose Monday, May 11th, 2026");
    const sunday = dayNamed("Choose Sunday, May 17th, 2026");
    const previousSunday = dayNamed("Choose Sunday, May 10th, 2026");

    expect(monday.closest(".react-datepicker__week")).toBe(
      sunday.closest(".react-datepicker__week"),
    );
    expect(previousSunday.closest(".react-datepicker__week")).not.toBe(
      monday.closest(".react-datepicker__week"),
    );
  });

  it("keeps Sunday-first columns for a single-day Day view window", () => {
    renderPicker(
      <MonthPicker
        onSelectDate={mock()}
        selectedDate={dayjs("2026-05-13")}
        viewEnd={dayjs("2026-05-13")}
        viewStart={dayjs("2026-05-13")}
      />,
    );

    const firstHeader = screen
      .getByRole("group", { name: "Date navigation" })
      .querySelector(".react-datepicker__day-name");
    expect(firstHeader?.textContent).toBe("S");
  });

  it("lets the chevrons change the displayed month", async () => {
    const user = userEvent.setup({ skipHover: true });
    const onSelectDate = mock();
    renderPicker(<MonthPicker onSelectDate={onSelectDate} {...pickerProps} />);

    await user.click(screen.getByRole("button", { name: "Previous month" }));

    expect(screen.getByText("Apr 2026")).toBeInTheDocument();
    expect(onSelectDate).not.toHaveBeenCalled();
  });

  it("steps the displayed month back and forward without selecting a date", async () => {
    const onSelectDate = mock();
    renderPicker(<MonthPicker onSelectDate={onSelectDate} {...pickerProps} />);

    expect(screen.getByText("May 2026")).toBeInTheDocument();

    act(() => {
      pressMonthChord(",");
    });

    await waitFor(() => {
      expect(screen.getByText("Apr 2026")).toBeInTheDocument();
    });
    expect(screen.queryByText("May 2026")).not.toBeInTheDocument();
    expect(onSelectDate).not.toHaveBeenCalled();

    act(() => {
      pressMonthChord(".");
    });

    await waitFor(() => {
      expect(screen.getByText("May 2026")).toBeInTheDocument();
    });
    expect(onSelectDate).not.toHaveBeenCalled();
  });

  it("steps the month when Shift+, produces < (US QWERTY)", async () => {
    const onSelectDate = mock();
    renderPicker(<MonthPicker onSelectDate={onSelectDate} {...pickerProps} />);

    act(() => {
      pressMonthChord("<");
    });

    await waitFor(() => {
      expect(screen.getByText("Apr 2026")).toBeInTheDocument();
    });
    expect(onSelectDate).not.toHaveBeenCalled();
  });

  it("does not show remaining-key chips on the chevrons while Mod-hold hints are visible", () => {
    usePageJumpHintStore.setState({ areHintsVisible: true });
    renderPicker(<MonthPicker onSelectDate={mock()} {...pickerProps} />);

    const picker = screen.getByRole("group", { name: "Date navigation" });
    expect(picker.textContent).not.toContain("Shift");
    expect(picker.textContent).not.toContain(",");
    expect(picker.textContent).not.toContain(".");
  });

  it("keeps the selected day bold across the whole cursor week", () => {
    renderPicker(<MonthPicker onSelectDate={mock()} {...pickerProps} />);

    expect(dayNamed("Choose Sunday, May 17th, 2026")).toHaveClass(
      "!font-semibold",
    );
    expect(dayNamed("Choose Saturday, May 23rd, 2026")).toHaveClass(
      "!font-semibold",
    );
    expect(dayNamed("Choose Sunday, May 24th, 2026")).toHaveClass(
      "!font-light",
    );
  });

  it("labels the today control with the t shortcut in its tooltip", async () => {
    const user = userEvent.setup();
    renderPicker(<MonthPicker onSelectDate={mock()} {...pickerProps} />);

    const todayButton = screen.getByRole("button", {
      name: "Go to this month",
    });

    await user.hover(todayButton);

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent(dayjs().format("MMM YYYY"));
    expect(tooltip).toHaveTextContent("T");
  });
});
