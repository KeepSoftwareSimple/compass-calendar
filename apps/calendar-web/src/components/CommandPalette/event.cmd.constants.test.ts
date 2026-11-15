import { APP_SHORTCUT_BINDINGS } from "@core/shortcuts/app-shortcut-bindings";
import { KEYMAP } from "@core/shortcuts/keymap";
import {
  eventCommandPaletteItems,
  TOGGLE_ALLDAY_ROW_ITEM_ID,
} from "@web/components/CommandPalette/event.cmd.constants";
import { describe, expect, it } from "bun:test";

describe("eventCommandPaletteItems", () => {
  it("reads create and all-day shortcuts from the binding tables", () => {
    const shortcutById = Object.fromEntries(
      eventCommandPaletteItems.map((item) => [item.id, item.shortcut]),
    );

    expect(shortcutById).toEqual({
      "create-event": KEYMAP.createEvent.hotkey.toLowerCase(),
      "create-allday-event": [...APP_SHORTCUT_BINDINGS.createAllDay.keycaps],
      [TOGGLE_ALLDAY_ROW_ITEM_ID]: [
        ...APP_SHORTCUT_BINDINGS.navToggleAllDay.keycaps,
      ],
    });
  });
});
