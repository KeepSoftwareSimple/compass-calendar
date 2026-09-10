import { createMockAccountRef as account } from "@web/__tests__/utils/factories/calendar.factory";
import { PICK_KEY_LABELS } from "@web/shortcuts/digit-pick.util";
import {
  buildCalendarPageJumpTargets,
  buildDayPageJumpTargets,
  CALENDAR_PAGE_JUMP_TARGETS,
  calendarAccountJumpId,
  dayColumnJumpId,
  focusPageJumpTarget,
  getPageJumpFocusElement,
  LIFE_PAGE_JUMP_TARGETS,
  PAGE_JUMP_ATTRIBUTE,
  type PageJumpTargetId,
} from "@web/shortcuts/page-jump/page-jump.targets";
import { afterEach, describe, expect, it } from "bun:test";

const addAnchor = (id: PageJumpTargetId): HTMLElement => {
  const anchor = document.createElement("section");
  anchor.setAttribute(PAGE_JUMP_ATTRIBUTE, id);
  document.body.append(anchor);
  return anchor;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe.each([
  ["CALENDAR_PAGE_JUMP_TARGETS", CALENDAR_PAGE_JUMP_TARGETS],
  ["LIFE_PAGE_JUMP_TARGETS", LIFE_PAGE_JUMP_TARGETS],
])("%s", (_name, targets) => {
  it("assigns sequential digits matching each target's list position", () => {
    // usePageJumpShortcut resolves a pressed digit by index, so the digit
    // shown on a chip must always equal the physical top-row label.
    targets.forEach((target, index) => {
      expect(target.digit).toBe(PICK_KEY_LABELS[index]);
    });
  });
});

describe("buildCalendarPageJumpTargets", () => {
  it("matches the no-account Week map when no emails are given", () => {
    expect(buildCalendarPageJumpTargets()).toEqual(CALENDAR_PAGE_JUMP_TARGETS);
  });

  it("replaces the list-level calendars slot with one target per account", () => {
    const work = account("ahab@pequod.com");
    const personal = account("ahab@gmail.com");
    const targets = buildCalendarPageJumpTargets([work, personal]);

    expect(
      targets.map(({ digit, id, label }) => ({ digit, id, label })),
    ).toEqual([
      { digit: "1", id: "view-select", label: "View dropdown" },
      { digit: "2", id: "month-picker", label: "Month picker" },
      { digit: "3", id: "up-next", label: "Up next" },
      {
        digit: "4",
        id: "calendar-account:google:ahab@pequod.com",
        label: "ahab@pequod.com (Google)",
      },
      {
        digit: "5",
        id: "calendar-account:google:ahab@gmail.com",
        label: "ahab@gmail.com (Google)",
      },
    ]);
  });

  it("gives same-email accounts on different providers distinct targets", () => {
    const targets = buildCalendarPageJumpTargets([
      account("lance@gmail.com", "google"),
      account("lance@gmail.com", "microsoft"),
    ]);

    expect(targets.slice(3).map(({ id, label }) => ({ id, label }))).toEqual([
      {
        id: "calendar-account:google:lance@gmail.com",
        label: "lance@gmail.com (Google)",
      },
      {
        id: "calendar-account:microsoft:lance@gmail.com",
        label: "lance@gmail.com (Microsoft)",
      },
    ]);
  });

  it("omits extra accounts that would overflow the top-row keys", () => {
    const accounts = Array.from(
      { length: PICK_KEY_LABELS.length },
      (_, index) => account(`account${index}@x.com`),
    );
    const targets = buildCalendarPageJumpTargets(accounts);

    expect(targets).toHaveLength(PICK_KEY_LABELS.length);
    expect(targets[0]).toMatchObject({ id: "view-select" });
    expect(targets[1]).toMatchObject({ id: "month-picker" });
    expect(targets[2]).toMatchObject({ id: "up-next" });
    expect(
      targets.filter((target) => target.id.startsWith("calendar-account:")),
    ).toHaveLength(PICK_KEY_LABELS.length - 3);
  });
});

describe("buildDayPageJumpTargets", () => {
  it("numbers left to right: view, columns, then sidebar", () => {
    const personal = { id: "cal-personal", name: "Personal" };
    const work = { id: "cal-work", name: "Work" };
    const targets = buildDayPageJumpTargets([personal, work]);

    expect(
      targets.map(({ digit, id, label }) => ({ digit, id, label })),
    ).toEqual([
      { digit: "1", id: "view-select", label: "View dropdown" },
      { digit: "2", id: dayColumnJumpId(personal.id), label: "Personal" },
      { digit: "3", id: dayColumnJumpId(work.id), label: "Work" },
      { digit: "4", id: "month-picker", label: "Month picker" },
      { digit: "5", id: "up-next", label: "Up next" },
      { digit: "6", id: "calendars", label: "Calendar list" },
    ]);
  });

  it("starts the first column at 2 so sidebar digits follow the columns", () => {
    const targets = buildDayPageJumpTargets([{ id: "cal-1", name: "Work" }]);
    expect(targets.map((target) => target.digit)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    expect(targets[1]).toEqual({
      digit: "2",
      id: dayColumnJumpId("cal-1"),
      label: "Work",
    });
    expect(targets.at(-1)).toMatchObject({ id: "calendars", digit: "5" });
  });

  it("omits calendars that would overflow the reserved sidebar slots", () => {
    const sidebarCount = CALENDAR_PAGE_JUMP_TARGETS.length - 1;
    const maxColumns = PICK_KEY_LABELS.length - 1 - sidebarCount;
    const calendars = Array.from({ length: maxColumns + 3 }, (_, index) => ({
      id: `cal-${index}`,
      name: `Calendar ${index}`,
    }));
    const targets = buildDayPageJumpTargets(calendars);

    expect(targets).toHaveLength(PICK_KEY_LABELS.length);
    expect(targets.at(-1)).toMatchObject({
      id: "calendars",
      digit: PICK_KEY_LABELS.at(-1),
    });
    expect(
      targets.filter((target) => target.id.startsWith("day-column:")),
    ).toHaveLength(maxColumns);
  });

  it("replaces the list-level calendars slot with one target per account", () => {
    const work = account("ahab@pequod.com");
    const personal = account("ahab@gmail.com");
    const targets = buildDayPageJumpTargets(
      [{ id: "cal-work", name: "Work" }],
      [work, personal],
    );

    expect(
      targets.map(({ digit, id, label }) => ({ digit, id, label })),
    ).toEqual([
      { digit: "1", id: "view-select", label: "View dropdown" },
      { digit: "2", id: dayColumnJumpId("cal-work"), label: "Work" },
      { digit: "3", id: "month-picker", label: "Month picker" },
      { digit: "4", id: "up-next", label: "Up next" },
      {
        digit: "5",
        id: calendarAccountJumpId(work.key),
        label: "ahab@pequod.com (Google)",
      },
      {
        digit: "6",
        id: calendarAccountJumpId(personal.key),
        label: "ahab@gmail.com (Google)",
      },
    ]);
  });

  it("omits extra columns so per-account sidebar slots still fit", () => {
    const accounts = ["a@x.com", "b@x.com", "c@x.com"].map((email) =>
      account(email),
    );
    const sidebarCount = buildCalendarPageJumpTargets(accounts).length - 1;
    const maxColumns = PICK_KEY_LABELS.length - 1 - sidebarCount;
    const calendars = Array.from({ length: maxColumns + 3 }, (_, index) => ({
      id: `cal-${index}`,
      name: `Calendar ${index}`,
    }));
    const targets = buildDayPageJumpTargets(calendars, accounts);

    expect(targets).toHaveLength(PICK_KEY_LABELS.length);
    expect(targets.at(-1)).toMatchObject({
      id: calendarAccountJumpId(account("c@x.com").key),
      digit: PICK_KEY_LABELS.at(-1),
    });
    expect(
      targets.filter((target) => target.id.startsWith("day-column:")),
    ).toHaveLength(maxColumns);
  });
});

describe("getPageJumpFocusElement", () => {
  it("returns null when the anchor is not mounted", () => {
    expect(getPageJumpFocusElement("month-picker")).toBeNull();
  });

  it("returns null when the anchor has nothing focusable", () => {
    // Matches the empty Up Next card: a section with only static text.
    const anchor = addAnchor("up-next");
    anchor.append(document.createTextNode("All clear"));

    expect(getPageJumpFocusElement("up-next")).toBeNull();
  });

  it("prefers an explicit tabindex=0 roving stop over earlier buttons", () => {
    // Mirrors the month picker: react-datepicker's prev/next buttons come
    // first in DOM order, but exactly one day keeps tabindex=0.
    const anchor = addAnchor("month-picker");
    const prevMonth = document.createElement("button");
    anchor.append(prevMonth);
    const day = document.createElement("div");
    day.setAttribute("tabindex", "0");
    anchor.append(day);

    expect(getPageJumpFocusElement("month-picker")).toBe(day);
  });

  it("falls back to the first interactive element", () => {
    const anchor = addAnchor("view-select");
    const disabled = document.createElement("button");
    disabled.disabled = true;
    anchor.append(disabled);
    const trigger = document.createElement("button");
    anchor.append(trigger);

    expect(getPageJumpFocusElement("view-select")).toBe(trigger);
  });
});

describe("focusPageJumpTarget", () => {
  it("focuses the resolved element and reports success", () => {
    const anchor = addAnchor("calendars");
    const toggle = document.createElement("button");
    anchor.append(toggle);

    expect(focusPageJumpTarget("calendars")).toBe(true);
    expect(document.activeElement).toBe(toggle);
  });

  it("reports failure when the target cannot take focus", () => {
    expect(focusPageJumpTarget("calendars")).toBe(false);
  });

  it("clicks a closed menu trigger so the dropdown opens", () => {
    const anchor = addAnchor("view-select");
    const trigger = document.createElement("button");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.addEventListener("click", () => {
      trigger.setAttribute("aria-expanded", "true");
    });
    anchor.append(trigger);

    expect(focusPageJumpTarget("view-select")).toBe(true);
    expect(document.activeElement).toBe(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("does not click an already-open menu trigger", () => {
    const anchor = addAnchor("view-select");
    const trigger = document.createElement("button");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "true");
    let clicks = 0;
    trigger.addEventListener("click", () => {
      clicks += 1;
    });
    anchor.append(trigger);

    expect(focusPageJumpTarget("view-select")).toBe(true);
    expect(clicks).toBe(0);
  });

  it("does not click a plain focusable control", () => {
    const anchor = addAnchor("calendars");
    const toggle = document.createElement("button");
    let clicks = 0;
    toggle.addEventListener("click", () => {
      clicks += 1;
    });
    anchor.append(toggle);

    expect(focusPageJumpTarget("calendars")).toBe(true);
    expect(clicks).toBe(0);
  });

  it("expands a collapsed account heading so its calendars are revealed", () => {
    const id = calendarAccountJumpId("ahab@gmail.com");
    const anchor = addAnchor(id);
    const toggle = document.createElement("button");
    toggle.setAttribute("aria-controls", "account-calendars");
    toggle.setAttribute("aria-expanded", "false");
    toggle.addEventListener("click", () => {
      toggle.setAttribute("aria-expanded", "true");
    });
    anchor.append(toggle);

    expect(focusPageJumpTarget(id)).toBe(true);
    expect(document.activeElement).toBe(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("does not collapse an already-expanded account heading", () => {
    const id = calendarAccountJumpId("ahab@gmail.com");
    const anchor = addAnchor(id);
    const toggle = document.createElement("button");
    toggle.setAttribute("aria-expanded", "true");
    let clicks = 0;
    toggle.addEventListener("click", () => {
      clicks += 1;
    });
    anchor.append(toggle);

    expect(focusPageJumpTarget(id)).toBe(true);
    expect(clicks).toBe(0);
  });

  it("finds an account anchor whose key contains CSS-significant characters", () => {
    const id = calendarAccountJumpId(account("tyler+work@gmail.com").key);
    const anchor = addAnchor(id);
    const toggle = document.createElement("button");
    anchor.append(toggle);

    expect(focusPageJumpTarget(id)).toBe(true);
    expect(document.activeElement).toBe(toggle);
  });
});
