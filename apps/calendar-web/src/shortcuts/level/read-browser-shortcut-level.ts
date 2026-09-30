import {
  EXPLORER_LEVEL,
  levelForUsedCount,
} from "@web/shortcuts/level/shortcut-level";
import {
  readShortcutUsageProfile,
  type ShortcutUsageProfile,
  usedShortcutIds,
} from "@web/shortcuts/tips/shortcut-personalization.storage";

/** Plain read for pointer-hint retirement and newcomer tip cadence (#4126). */
export function readBrowserShortcutLevel(
  profile: ShortcutUsageProfile = readShortcutUsageProfile(),
): number {
  return levelForUsedCount(usedShortcutIds(profile).size).level;
}

export function hasReachedExplorerShortcutLevel(
  profile: ShortcutUsageProfile = readShortcutUsageProfile(),
): boolean {
  return readBrowserShortcutLevel(profile) >= EXPLORER_LEVEL;
}
