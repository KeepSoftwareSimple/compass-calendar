import { computeShortcutLevel } from "@web/shortcuts/level/shortcut-level";
import { SHORTCUTS_REGISTRY } from "@web/shortcuts/shortcuts.registry";
import {
  readShortcutUsageProfile,
  type ShortcutUsageProfile,
  usedShortcutIds,
} from "@web/shortcuts/tips/shortcut-personalization.storage";

const REGISTRY_IDS = SHORTCUTS_REGISTRY.map((shortcut) => shortcut.id);

/** Explorer (level 2) and above retire pointer-intent teaching for this session. */
export function isPointerIntentTeachingRetired(
  profile: ShortcutUsageProfile = readShortcutUsageProfile(),
): boolean {
  return (
    computeShortcutLevel(usedShortcutIds(profile), REGISTRY_IDS).level >= 2
  );
}
