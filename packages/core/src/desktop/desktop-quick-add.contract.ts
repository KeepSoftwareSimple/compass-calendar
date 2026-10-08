import { z } from "zod/v4";

/** Query flag the native macOS quick-add flow uses (`/?quickAdd=1`). */
export const DESKTOP_QUICK_ADD_SEARCH_PARAM = "quickAdd";

/** Default global hotkey (Carbon RegisterEventHotKey, no Accessibility). */
export const DESKTOP_QUICK_ADD_DEFAULT_HOTKEY = "Ctrl+Option+Cmd+Space";

export const DesktopQuickAddHotkeySchema = z.string().trim().min(3).max(64);
export type DesktopQuickAddHotkey = z.infer<typeof DesktopQuickAddHotkeySchema>;

export const DesktopBridgeSetQuickAddHotkeyMessageSchema = z.strictObject({
  method: z.literal("setQuickAddHotkey"),
  shortcut: DesktopQuickAddHotkeySchema,
});

export const DesktopBridgeDismissQuickAddPanelMessageSchema = z.strictObject({
  method: z.literal("dismissQuickAddPanel"),
});
