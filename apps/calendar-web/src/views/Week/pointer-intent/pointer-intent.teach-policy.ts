import { isAppLocked } from "@web/shortcuts/app-lock";
import { readPointerHintDismissedPermanently } from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import { hasReachedExplorerShortcutLevel } from "@web/shortcuts/level/read-browser-shortcut-level";
import { readShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import { readTipsMuted } from "@web/shortcuts/tips/shortcut-tips-muted.store";
import {
  INTENT_TEACHING,
  MAX_POINTER_HINTS_PER_SESSION,
  type PointerIntent,
} from "@web/views/Week/pointer-intent/pointer-intent";
import { type PointerIntentSessionSnapshot } from "@web/views/Week/pointer-intent/pointer-intent.session";

/** Hover-hunt and other pointer hints call this before arming (#4126, WP-03). */
export { hasReachedExplorerShortcutLevel as isPointerHintTeachingRetired };

export type ShouldTeachPointerIntentInput = {
  intent: PointerIntent;
  session: PointerIntentSessionSnapshot;
  tipsMuted?: boolean;
  tipsDismissedPermanently?: boolean;
  appLocked?: boolean;
  pillVisible?: boolean;
  usageProfile?: ReturnType<typeof readShortcutUsageProfile>;
};

export function shouldTeachPointerIntent({
  intent,
  session,
  tipsMuted = readTipsMuted(),
  tipsDismissedPermanently = readPointerHintDismissedPermanently(),
  appLocked = isAppLocked(),
  pillVisible = false,
  usageProfile = readShortcutUsageProfile(),
}: ShouldTeachPointerIntentInput): boolean {
  if (hasReachedExplorerShortcutLevel(usageProfile)) {
    return false;
  }
  if (tipsMuted || tipsDismissedPermanently || appLocked || pillVisible) {
    return false;
  }
  if (session.shownIntents.has(intent)) return false;
  if (session.hintsShownThisSession >= MAX_POINTER_HINTS_PER_SESSION) {
    return false;
  }
  const retirementId = INTENT_TEACHING[intent].shortcutIds[0];
  const usage = usageProfile.shortcuts[retirementId];
  if (usage && usage.invocations > 0) return false;
  return true;
}
