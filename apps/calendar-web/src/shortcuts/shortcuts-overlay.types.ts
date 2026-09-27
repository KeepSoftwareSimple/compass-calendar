import { type Shortcut } from "@web/shortcuts/global.shortcut.types";

export interface ShortcutOverlaySection {
  id: string;
  title: string;
  shortcuts: Shortcut[];
}
