import { selectShortcutHint } from "@web/shortcuts/tips/selectShortcutHint";
import {
  getHintPlainText,
  type RankedShortcutHint,
} from "@web/shortcuts/tips/shortcut-tips.data";
import { describe, expect, it } from "bun:test";

const hintFor = (
  ...args: Parameters<typeof selectShortcutHint>
): RankedShortcutHint => selectShortcutHint(...args)!;

const calendarIdle = {
  isFormOpen: false,
  isLifeView: false,
  eventFocused: false,
  firstEventDone: false,
};

const afterFirstEvent = {
  ...calendarIdle,
  firstEventDone: true,
};

describe("selectShortcutHint", () => {
  it("returns null when sidebar tips are muted", () => {
    expect(
      selectShortcutHint(calendarIdle, [], undefined, Date.now(), true),
    ).toBe(null);
  });

  it("teaches title then Enter while the first-event form is open", () => {
    expect(
      hintFor({
        ...calendarIdle,
        isFormOpen: true,
      }).id,
    ).toBe("first-event-save");
  });

  it("teaches save and Mod jump once the first event is done and the form is open", () => {
    expect(
      hintFor({
        ...calendarIdle,
        isFormOpen: true,
        firstEventDone: true,
      }).id,
    ).toBe("save-draft");
  });

  it("teaches T on Life even before the first real event", () => {
    expect(
      hintFor({
        ...calendarIdle,
        isLifeView: true,
      }).id,
    ).toBe("life-this-week");
  });

  it("prefers a focused event over the first-event create prompt", () => {
    expect(
      hintFor({
        ...calendarIdle,
        eventFocused: true,
      }).id,
    ).toBe("edit-sequence");
  });

  it("asks for C until the first real event exists", () => {
    expect(hintFor(calendarIdle).id).toBe("create-event");
  });

  it("teaches hold-Mod on an idle calendar after the first event", () => {
    expect(hintFor(afterFirstEvent).id).toBe("page-jump");
  });

  it("keeps form hints ahead of Life, focus, and first-event create", () => {
    expect(
      hintFor({
        isFormOpen: true,
        isLifeView: true,
        eventFocused: true,
        firstEventDone: true,
      }).id,
    ).toBe("save-draft");
  });

  it("skips hold-Mod on an idle calendar once the user has demonstrated it", () => {
    expect(hintFor(afterFirstEvent, ["page-jump"]).id).toBe("event-jump");
  });

  it("teaches week-column letters after event jump on week view", () => {
    expect(
      hintFor(
        {
          ...afterFirstEvent,
          isWeekView: true,
          jumpableDayPrefixes: ["m", "w"],
        },
        ["page-jump", "event-jump"],
      ).id,
    ).toBe("week-day-focus");
  });

  it("names the first jumpable column at or after tomorrow", () => {
    const hint = hintFor(
      {
        ...afterFirstEvent,
        isWeekView: true,
        jumpableDayPrefixes: ["m", "w", "sa"],
        // Monday, so Wednesday is the next taught column, not Monday again.
        todayWeekday: 1,
      },
      ["page-jump", "event-jump"],
    );
    expect(getHintPlainText(hint)).toBe("Shift+W jumps to Wednesday");
  });

  it("wraps past the end of the week when nothing later is jumpable", () => {
    const hint = hintFor(
      {
        ...afterFirstEvent,
        isWeekView: true,
        jumpableDayPrefixes: ["m"],
        todayWeekday: 5,
      },
      ["page-jump", "event-jump"],
    );
    expect(getHintPlainText(hint)).toBe("Shift+M jumps to Monday");
  });

  it("teaches the column even while an event is focused, since Shift always works", () => {
    expect(
      hintFor(
        {
          ...afterFirstEvent,
          eventFocused: true,
          isWeekView: true,
          jumpableDayPrefixes: ["m"],
        },
        ["edit-sequence", "nudge", "edge-focus", "page-jump", "event-jump"],
      ).id,
    ).toBe("week-day-focus");
  });

  it("skips the column tip when no day has a jump key", () => {
    expect(
      hintFor(
        { ...afterFirstEvent, isWeekView: true, jumpableDayPrefixes: [] },
        ["page-jump", "event-jump"],
      ).id,
    ).toBe("command-palette");
  });

  it("walks the idle pool in showcase order as primitives are demonstrated", () => {
    expect(hintFor(afterFirstEvent, ["page-jump", "event-jump"]).id).toBe(
      "command-palette",
    );
    expect(
      hintFor(afterFirstEvent, ["page-jump", "event-jump", "command-palette"])
        .id,
    ).toBe("create-event");
  });

  it("rotates the idle pool after every primitive has been demonstrated", () => {
    expect(
      hintFor(afterFirstEvent, [
        "event-jump",
        "command-palette",
        "create-event",
        "page-jump",
      ]).id,
    ).toBe("event-jump");
    expect(
      hintFor(afterFirstEvent, [
        "page-jump",
        "event-jump",
        "command-palette",
        "create-event",
      ]).id,
    ).toBe("page-jump");
  });

  it("teaches nudge after the edit sequence once an event is focused", () => {
    expect(
      hintFor({ ...afterFirstEvent, eventFocused: true }, ["edit-sequence"]).id,
    ).toBe("nudge");
  });

  it("teaches edge focus after nudge once an event is focused", () => {
    expect(
      hintFor({ ...afterFirstEvent, eventFocused: true }, [
        "edit-sequence",
        "nudge",
      ]).id,
    ).toBe("edge-focus");
  });

  it("teaches the action toolbar after save-draft is demonstrated", () => {
    expect(
      hintFor({ ...afterFirstEvent, isFormOpen: true }, ["save-draft"]).id,
    ).toBe("form-actions");
  });

  it("falls through to the command palette once the form tips are demonstrated", () => {
    expect(
      hintFor({ ...afterFirstEvent, isFormOpen: true }, [
        "save-draft",
        "form-actions",
      ]).id,
    ).toBe("command-palette");
  });

  it("falls through to the command palette after Life T is demonstrated", () => {
    expect(
      hintFor({ ...calendarIdle, isLifeView: true }, ["life-this-week"]).id,
    ).toBe("command-palette");
  });

  it("keeps the first-event save funnel sticky even after Enter is demonstrated", () => {
    expect(
      hintFor({ ...calendarIdle, isFormOpen: true }, ["first-event-save"]).id,
    ).toBe("first-event-save");
  });
});
