import {
  ID_GRID_MAIN,
  ID_MAIN,
  ID_SIDEBAR,
} from "@web/common/constants/web.constants";
import { rememberSidebarPickerReturnFocus } from "@web/components/Sidebar/util/sidebarFocus.util";
import { draftActions } from "@web/events/stores/draft.store";
import { viewActions } from "@web/events/stores/view.store";
import {
  detectCalendarUiFocusRegion,
  detectLifeUiFocusRegion,
  moveCalendarUiFocusLeft,
  moveCalendarUiFocusRight,
  moveLifeUiFocusLeft,
  moveLifeUiFocusRight,
} from "@web/shortcuts/ui-focus/ui-focus-region.util";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

describe("ui-focus-region", () => {
  beforeEach(() => {
    viewActions.setSidebarOpen(true);
    draftActions.discard();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    draftActions.discard();
  });

  const mountCalendarChrome = () => {
    const main = document.createElement("main");
    main.id = ID_MAIN;
    const grid = document.createElement("div");
    grid.id = ID_GRID_MAIN;
    grid.tabIndex = 0;
    main.appendChild(grid);

    const sidebar = document.createElement("aside");
    sidebar.id = ID_SIDEBAR;
    const day = document.createElement("button");
    day.className = "react-datepicker__day";
    day.tabIndex = 0;
    sidebar.appendChild(day);

    document.body.append(main, sidebar);
    return { grid, day };
  };

  it("detects grid vs sidebar regions", () => {
    const { grid, day } = mountCalendarChrome();
    grid.focus();
    expect(detectCalendarUiFocusRegion()).toBe("grid");

    day.focus();
    expect(detectCalendarUiFocusRegion()).toBe("sidebar");
  });

  it("moves right from grid into the month picker", () => {
    const { grid, day } = mountCalendarChrome();
    grid.focus();

    moveCalendarUiFocusRight();

    expect(document.activeElement).toBe(day);
  });

  it("moves left from the month picker back to the grid", () => {
    const { grid, day } = mountCalendarChrome();
    grid.focus();
    rememberSidebarPickerReturnFocus();
    day.focus();

    const focusGridEvent = mock(() => {});
    moveCalendarUiFocusLeft(focusGridEvent);

    expect(document.activeElement).toBe(grid);
    expect(focusGridEvent).not.toHaveBeenCalled();
  });

  it("detects life grid vs sidebar", () => {
    const main = document.createElement("main");
    main.id = ID_MAIN;
    const viz = document.createElement("section");
    viz.setAttribute("aria-label", "Life visualization");
    const week = document.createElement("button");
    week.type = "button";
    viz.appendChild(week);
    main.appendChild(viz);

    const sidebar = document.createElement("aside");
    sidebar.id = ID_SIDEBAR;
    const details = document.createElement("section");
    details.setAttribute("aria-label", "Life details");
    const birth = document.createElement("input");
    birth.id = "life-date-of-birth";
    details.appendChild(birth);
    sidebar.appendChild(details);
    document.body.append(main, sidebar);

    week.focus();
    expect(detectLifeUiFocusRegion()).toBe("grid");
    birth.focus();
    expect(detectLifeUiFocusRegion()).toBe("sidebar");
  });

  it("moves life focus between grid and birth date field", () => {
    const main = document.createElement("main");
    main.id = ID_MAIN;
    main.setAttribute("data-page-jump", "life-grid");
    const week = document.createElement("button");
    week.type = "button";
    week.tabIndex = 0;
    main.appendChild(week);

    const sidebar = document.createElement("aside");
    sidebar.id = ID_SIDEBAR;
    const details = document.createElement("section");
    details.setAttribute("aria-label", "Life details");
    const birth = document.createElement("input");
    birth.id = "life-date-of-birth";
    details.appendChild(birth);
    sidebar.appendChild(details);
    document.body.append(main, sidebar);

    week.focus();
    moveLifeUiFocusRight();
    expect(document.activeElement).toBe(birth);

    moveLifeUiFocusLeft();
    expect(document.activeElement).toBe(week);
  });
});
