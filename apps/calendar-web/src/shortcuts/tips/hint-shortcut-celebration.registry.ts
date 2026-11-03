import { hintShortcutCelebrationKeyAtPartIndex } from "@core/shortcuts/hint-shortcut-celebration.util";
import { type ShortcutRegistryId } from "@web/shortcuts/shortcuts.registry";
import { SHORTCUT_HINTS } from "@web/shortcuts/tips/shortcut-tips.data";

const weekNavParts = SHORTCUT_HINTS["week-nav"].parts;
const gridScrollParts = SHORTCUT_HINTS["grid-scroll"].parts;

/** Registry shortcuts that map to a specific keycap group in a sidebar hint. */
export const REGISTRY_HINT_SHORTCUT_CELEBRATION_KEYS: Partial<
  Record<ShortcutRegistryId, string>
> = {
  "nav-scroll-down": hintShortcutCelebrationKeyAtPartIndex(
    "grid-scroll",
    gridScrollParts,
    2,
  )!,
  "nav-scroll-hour-down": hintShortcutCelebrationKeyAtPartIndex(
    "grid-scroll",
    gridScrollParts,
    0,
  )!,
  "nav-scroll-hour-up": hintShortcutCelebrationKeyAtPartIndex(
    "grid-scroll",
    gridScrollParts,
    0,
  )!,
  "nav-previous": hintShortcutCelebrationKeyAtPartIndex(
    "week-nav",
    weekNavParts,
    0,
  )!,
  "nav-next": hintShortcutCelebrationKeyAtPartIndex(
    "week-nav",
    weekNavParts,
    2,
  )!,
  "nav-today": hintShortcutCelebrationKeyAtPartIndex(
    "week-nav",
    weekNavParts,
    4,
  )!,
  "create-timed": hintShortcutCelebrationKeyAtPartIndex(
    "create-event",
    SHORTCUT_HINTS["create-event"].parts,
    0,
  )!,
  "other-palette": hintShortcutCelebrationKeyAtPartIndex(
    "command-palette",
    SHORTCUT_HINTS["command-palette"].parts,
    0,
  )!,
};
