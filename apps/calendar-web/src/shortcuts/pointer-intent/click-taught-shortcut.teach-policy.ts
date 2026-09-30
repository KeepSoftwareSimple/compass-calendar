import { isAppLocked } from "@web/shortcuts/app-lock";
import { readPointerHintDismissedPermanently } from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import { type ShortcutRegistryId } from "@web/shortcuts/shortcuts.registry";
import { readShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import { readTipsMuted } from "@web/shortcuts/tips/shortcut-tips-muted.store";
import { MAX_POINTER_HINTS_PER_SESSION } from "@web/views/Week/pointer-intent/pointer-intent";
import { type PointerIntentSessionSnapshot } from "@web/views/Week/pointer-intent/pointer-intent.session";

export type ShouldTeachClickTaughtShortcutInput = {
  shortcutId: ShortcutRegistryId;
  session: PointerIntentSessionSnapshot;
  tipsMuted?: boolean;
  tipsDismissedPermanently?: boolean;
  appLocked?: boolean;
  pillVisible?: boolean;
  usageProfile?: ReturnType<typeof readShortcutUsageProfile>;
};

export function shouldTeachClickTaughtShortcut({
  shortcutId,
  session,
  tipsMuted = readTipsMuted(),
  tipsDismissedPermanently = readPointerHintDismissedPermanently(),
  appLocked = isAppLocked(),
  pillVisible = false,
  usageProfile = readShortcutUsageProfile(),
}: ShouldTeachClickTaughtShortcutInput): boolean {
  if (tipsMuted || tipsDismissedPermanently || appLocked || pillVisible) {
    return false;
  }
  if (session.shownClickShortcutIds.has(shortcutId)) return false;
  if (session.hintsShownThisSession >= MAX_POINTER_HINTS_PER_SESSION) {
    return false;
  }
  const usage = usageProfile.shortcuts[shortcutId];
  if (usage && usage.invocations > 0) return false;
  return true;
}
