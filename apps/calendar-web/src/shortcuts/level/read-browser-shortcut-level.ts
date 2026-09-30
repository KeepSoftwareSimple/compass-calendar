import { computeShortcutLevel } from "@web/shortcuts/level/shortcut-level";
import { SHORTCUTS_REGISTRY } from "@web/shortcuts/shortcuts.registry";
import {
  readShortcutUsageProfile,
  usedShortcutIds,
} from "@web/shortcuts/tips/shortcut-personalization.storage";

const REGISTRY_IDS = SHORTCUTS_REGISTRY.map((shortcut) => shortcut.id);

/** Plain read for pointer-hint retirement and newcomer tip cadence (#4126). */
export function readBrowserShortcutLevel(
  profile = readShortcutUsageProfile(),
): number {
  return computeShortcutLevel(usedShortcutIds(profile), REGISTRY_IDS).level;
}

export function hasReachedExplorerShortcutLevel(
  profile = readShortcutUsageProfile(),
): boolean {
  return readBrowserShortcutLevel(profile) >= 2;
}
