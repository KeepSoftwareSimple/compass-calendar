import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "@core/util/date/dayjs";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import {
  isAllDayRowCollapsibleNow,
  readAllDayRowExpanded,
  resetAllDayRowCollapseStoreForTests,
  toggleAllDayRowExpanded,
} from "@web/grid/all-day-row/allDayRowCollapse.store";
import {
  EVENT_ALLDAY_GAP,
  EVENT_ALLDAY_ROW_HEIGHT,
} from "@web/grid/grid.constants";
import { ALL_DAY_COLUMN_TINT_PERCENT } from "@web/grid/utils/allDayColumnTint.util";
import {
  collapsedAllDayRowHeightPx,
  compactAllDayRowHeightPx,
} from "@web/grid/utils/allDayRowHeight.util";
import { AllDayGridRow } from "./AllDayGridRow";
import { beforeEach, describe, expect, it } from "bun:test";

const today = dayjs("2026-04-24");

describe("AllDayGridRow", () => {
  it("applies the all-day tint wash on columns that carry a tint color", () => {
    const tint = "#039BE5";
    render(
      <AllDayGridRow
        allDayColumnsRef={() => {}}
        allDayRowRef={() => {}}
        eventsLayer={null}
        visibleDates={[
          {
            date: today,
            key: "today",
            allDayTintColor: tint,
            surfaceLabel: "Tinted all-day column",
          },
        ]}
      />,
    );

    const column = screen.getByRole("columnheader", {
      name: "Tinted all-day column",
    });
    expect(column.getAttribute("data-all-day-tint")).toBe("true");
    expect(column.style.getPropertyValue("--column-all-day-tint")).toBe(tint);
    // jsdom may normalize the hex inside color-mix to rgb(...).
    expect(column.style.backgroundColor).toContain("color-mix(in srgb,");
    expect(column.style.backgroundColor).toContain(
      `${ALL_DAY_COLUMN_TINT_PERCENT}%`,
    );
  });

  it("marks the highlighted calendar column", () => {
    render(
      <AllDayGridRow
        allDayColumnsRef={() => {}}
        allDayRowRef={() => {}}
        eventsLayer={null}
        highlightedColumnKey="work"
        visibleDates={[
          {
            date: today,
            key: "personal",
            surfaceLabel: "Personal all-day column",
          },
          {
            date: today,
            key: "work",
            surfaceLabel: "Work all-day column",
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("columnheader", { name: "Work all-day column" }),
    ).toHaveAttribute("data-focused-column", "true");
    expect(
      screen.getByRole("columnheader", { name: "Personal all-day column" }),
    ).not.toHaveAttribute("data-focused-column");
  });

  it("keeps an empty row to one slim clickable lane", () => {
    render(
      <AllDayGridRow
        allDayColumnsRef={() => {}}
        allDayRowRef={() => {}}
        eventsLayer={<span>No events yet</span>}
        rowsCount={0}
        visibleDates={[
          { date: today, key: "today", surfaceLabel: "Today all-day column" },
        ]}
      />,
    );

    expect(screen.getByRole("region", { name: "All-day events" })).toHaveStyle({
      height: `${2 * EVENT_ALLDAY_GAP + EVENT_ALLDAY_ROW_HEIGHT}px`,
    });
    expect(screen.queryByRole("button", { name: /all-day row/i })).toBeNull();
  });

  it("grows with real lanes plus one spare lane up to the collapse threshold", () => {
    render(
      <AllDayGridRow
        allDayColumnsRef={() => {}}
        allDayRowRef={() => {}}
        eventsLayer={<span>Stacked events</span>}
        rowsCount={3}
        visibleDates={[
          { date: today, key: "today", surfaceLabel: "Today all-day column" },
        ]}
      />,
    );

    expect(screen.getByRole("region", { name: "All-day events" })).toHaveStyle({
      height: `${compactAllDayRowHeightPx(3)}px`,
      minHeight: `${2 * EVENT_ALLDAY_GAP + 3 * EVENT_ALLDAY_ROW_HEIGHT}px`,
    });
    expect(screen.getByText("Stacked events")).toBeVisible();
    expect(screen.queryByRole("button", { name: /all-day row/i })).toBeNull();
  });

  describe("busy row", () => {
    beforeEach(() => {
      localStorage.clear();
      resetAllDayRowCollapseStoreForTests();
    });

    const renderBusy = (props: { forceExpanded?: boolean } = {}) =>
      render(
        <AllDayGridRow
          allDayColumnsRef={() => {}}
          allDayRowRef={() => {}}
          eventsLayer={<span>Many events</span>}
          hiddenCountsByColumn={[4, 0]}
          rowsCount={6}
          visibleDates={[
            { date: today, key: "a", surfaceLabel: "A all-day column" },
            { date: today, key: "b", surfaceLabel: "B all-day column" },
          ]}
          {...props}
        />,
      );

    it("caps the height, shows +N more per day, and toggles from the gutter", async () => {
      const user = userEvent.setup();
      renderBusy();

      const region = screen.getByRole("region", { name: "All-day events" });
      expect(region).toHaveStyle({
        height: `${collapsedAllDayRowHeightPx()}px`,
      });
      expect(region).toHaveAttribute("data-allday-collapsed", "true");
      expect(isAllDayRowCollapsibleNow()).toBe(true);
      expect(screen.getAllByRole("button", { name: /more$/ })).toHaveLength(1);
      expect(screen.getByRole("button", { name: "+4 more" })).toBeVisible();

      const toggle = screen.getByRole("button", { name: "Expand all-day row" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      await user.click(toggle);

      expect(region).toHaveStyle({
        height: `${compactAllDayRowHeightPx(6)}px`,
      });
      expect(
        screen.getByRole("button", { name: "Collapse all-day row" }),
      ).toHaveAttribute("aria-expanded", "true");
      expect(screen.queryByRole("button", { name: "+4 more" })).toBeNull();
      expect(readAllDayRowExpanded()).toBe(true);
      expect(localStorage.getItem(STORAGE_KEYS.ALL_DAY_ROW_EXPANDED)).toBe(
        "true",
      );
    });

    it("expands from a +N more button", async () => {
      const user = userEvent.setup();
      renderBusy();
      await user.click(screen.getByRole("button", { name: "+4 more" }));
      expect(readAllDayRowExpanded()).toBe(true);
    });

    it("stays open while a draft sits in a folded lane", () => {
      renderBusy({ forceExpanded: true });
      expect(
        screen.getByRole("region", { name: "All-day events" }),
      ).toHaveStyle({ height: `${compactAllDayRowHeightPx(6)}px` });
      expect(readAllDayRowExpanded()).toBe(false);
    });

    it("collapses again when focus enters and leaves a folded event in one batch", () => {
      render(
        <>
          <AllDayGridRow
            allDayColumnsRef={() => {}}
            allDayRowRef={() => {}}
            eventsLayer={<button type="button">Folded event</button>}
            rowsCount={6}
            visibleDates={[
              { date: today, key: "a", surfaceLabel: "A all-day column" },
            ]}
          />
          <button type="button">Timed grid</button>
        </>,
      );
      const chip = screen.getByRole("button", { name: "Folded event" });
      Object.defineProperty(chip, "getBoundingClientRect", {
        value: () => ({ top: 100 }),
      });
      act(() => {
        chip.focus();
        screen.getByRole("button", { name: "Timed grid" }).focus();
      });
      expect(
        screen.getByRole("region", { name: "All-day events" }),
      ).toHaveAttribute("data-allday-collapsed", "true");
      expect(readAllDayRowExpanded()).toBe(false);
    });

    it("toggle is a no-op when the row has nothing to fold", () => {
      expect(toggleAllDayRowExpanded()).toBe(false);
      expect(readAllDayRowExpanded()).toBe(false);
    });
  });
});
