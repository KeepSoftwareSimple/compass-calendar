import {
  SHORTCUT_LEVELS,
  type ShortcutLevelDefinition,
} from "@web/shortcuts/level/shortcut-level";
import {
  readShortcutUsageProfile,
  type ShortcutUsageProfile,
  usedShortcutIds,
} from "@web/shortcuts/tips/shortcut-personalization.storage";

const EXPLORER_MIN_USED =
  SHORTCUT_LEVELS.find((level) => level.level === 2)?.minUsed ?? 4;

function levelForUsedCount(used: number): ShortcutLevelDefinition {
  return SHORTCUT_LEVELS.reduce(
    (winner, definition) => (definition.minUsed <= used ? definition : winner),
    SHORTCUT_LEVELS[0],
  );
}

/** Plain read for pointer-hint retirement and newcomer tip cadence (#4126). */
export function readBrowserShortcutLevel(
  profile: ShortcutUsageProfile = readShortcutUsageProfile(),
): number {
  return levelForUsedCount(usedShortcutIds(profile).size).level;
}

export function hasReachedExplorerShortcutLevel(
  profile: ShortcutUsageProfile = readShortcutUsageProfile(),
): boolean {
  return usedShortcutIds(profile).size >= EXPLORER_MIN_USED;
}
