import { expandModInShortcutDisplay } from "@web/shortcuts/shortcut.util";
import {
  getHintPlainText,
  getPartsPlainText,
  SHORTCUT_HINTS,
  weekDayFocusHint,
} from "@web/shortcuts/tips/shortcut-tips.data";
import { describe, expect, it } from "bun:test";

describe("getHintPlainText", () => {
  it("reconstitutes each hint's full sentence from its parts", () => {
    const plainTextById = Object.fromEntries(
      Object.values(SHORTCUT_HINTS).map((hint) => [
        hint.id,
        getHintPlainText(hint),
      ]),
    );
    const mod = expandModInShortcutDisplay("Mod") === "Meta" ? "Cmd" : "Ctrl";

    expect(plainTextById["first-event-save"]).toBe("Type a title, then Enter");
    expect(plainTextById["save-draft"]).toBe(
      `Enter saves · hold ${mod} to jump fields`,
    );
    expect(plainTextById["life-this-week"]).toBe("T jumps to this week");
    expect(plainTextById["edit-sequence"]).toBe("E then T edits the title");
    expect(plainTextById["create-event"]).toBe("C creates an event");
    expect(plainTextById["page-jump"]).toBe(`Hold ${mod} to see jump targets`);
    expect(plainTextById["event-jump"]).toBe(
      "H shows event and open-time shortcuts",
    );
    expect(plainTextById["week-day-focus"]).toBe("Shift+M jumps to Monday");
    expect(plainTextById.nudge).toBe("Shift and an arrow moves the event");
    expect(plainTextById["edge-focus"]).toBe(
      "Tab picks an edge, then Shift and up or down",
    );
    expect(plainTextById["command-palette"]).toBe(
      `${mod}+K opens the command palette`,
    );
  });

  it("names the day the sidebar picked, weekends as a two-key chord", () => {
    expect(getHintPlainText(weekDayFocusHint("w"))).toBe(
      "Shift+W jumps to Wednesday",
    );
    expect(getHintPlainText(weekDayFocusHint("r"))).toBe(
      "Shift+R jumps to Thursday",
    );
    expect(getHintPlainText(weekDayFocusHint("su"))).toBe(
      "Shift+S then U jumps to Sunday",
    );
    expect(getHintPlainText(weekDayFocusHint("sa"))).toBe(
      "Shift+S then A jumps to Saturday",
    );
  });

  it("keeps every tip short enough to wrap into the sidebar's two lines", () => {
    // The status bar is one line tall at SIDEBAR_MIN_WIDTH and may grow to
    // two. Nothing is ever clipped, so the budget lives here instead.
    for (const hint of Object.values(SHORTCUT_HINTS)) {
      const text = getHintPlainText(hint);
      expect({ id: hint.id, length: text.length <= 48 }).toEqual({
        id: hint.id,
        length: true,
      });
      expect(text).not.toContain("—");
      expect(text).not.toContain("–");
      expect(text.startsWith("Press ")).toBe(false);
      expect(text).not.toContain("On week view");
    }
  });

  it("joins a chord's keys with + and speaks Mod as Cmd or Ctrl", () => {
    const mod = expandModInShortcutDisplay("Mod") === "Meta" ? "Cmd" : "Ctrl";
    expect(
      getPartsPlainText([
        "Press ",
        { keys: ["Mod", "Z"] },
        " then ",
        { keys: ["Mod", "Shift", "Z"] },
      ]),
    ).toBe(`Press ${mod}+Z then ${mod}+Shift+Z`);
  });
});
