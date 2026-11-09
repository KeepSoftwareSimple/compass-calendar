import { type FC } from "react";
import { APP_SHORTCUT_BINDINGS } from "@core/shortcuts/app-shortcut-bindings";
import { KEYMAP } from "@core/shortcuts/keymap";
import { ShortcutTipParts } from "@web/shortcuts/tips/ShortcutTipParts";
import { type ShortcutTipPart } from "@web/shortcuts/tips/shortcut-tips.data";

export const EVENT_PASTE_PREVIEW_HINT_PARTS: readonly ShortcutTipPart[] = [
  "Copied · ",
  { key: KEYMAP.eventJump.bareLetter },
  " move day · ",
  { keys: [...APP_SHORTCUT_BINDINGS.editPaste.keycaps] },
  " paste · ",
  { key: "Esc" },
  " cancel",
];

/**
 * Sidebar hint while an event is on the in-app clipboard and the paste preview
 * is showing on the grid.
 */
export const EventPastePreviewIndicator: FC = () => (
  <span
    aria-live="polite"
    className="block w-full text-pretty break-words text-center text-text-muted text-xs leading-5 opacity-80"
    data-event-paste-preview-indicator=""
    role="status"
  >
    <ShortcutTipParts parts={EVENT_PASTE_PREVIEW_HINT_PARTS} />
  </span>
);
