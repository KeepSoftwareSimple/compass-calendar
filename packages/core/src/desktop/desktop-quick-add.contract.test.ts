import {
  DESKTOP_QUICK_ADD_DEFAULT_HOTKEY,
  DESKTOP_QUICK_ADD_SEARCH_PARAM,
  DesktopBridgeDismissQuickAddPanelMessageSchema,
  DesktopBridgeSetQuickAddHotkeyMessageSchema,
} from "@core/desktop/desktop-quick-add.contract";
import { describe, expect, it } from "bun:test";

describe("desktop quick-add contract", () => {
  it("uses a stable search param name", () => {
    expect(DESKTOP_QUICK_ADD_SEARCH_PARAM).toBe("quickAdd");
  });

  it("documents the default hotkey spelling", () => {
    expect(DESKTOP_QUICK_ADD_DEFAULT_HOTKEY).toBe("Ctrl+Option+Cmd+Space");
  });

  it("accepts setQuickAddHotkey bridge payloads", () => {
    expect(
      DesktopBridgeSetQuickAddHotkeyMessageSchema.parse({
        method: "setQuickAddHotkey",
        shortcut: DESKTOP_QUICK_ADD_DEFAULT_HOTKEY,
      }).method,
    ).toBe("setQuickAddHotkey");
  });

  it("accepts dismissQuickAddPanel bridge payloads", () => {
    expect(
      DesktopBridgeDismissQuickAddPanelMessageSchema.parse({
        method: "dismissQuickAddPanel",
      }).method,
    ).toBe("dismissQuickAddPanel");
  });
});
