import { type Shortcut } from "@core/shortcuts/shortcut.types";

export interface ShortcutOverlaySection {
  id: string;
  title: string;
  shortcuts: Shortcut[];
}
