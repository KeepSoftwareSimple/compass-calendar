import { isAppLocked } from "@web/shortcuts/app-lock";
import { readPointerHintDismissedPermanently } from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import { hasReachedExplorerShortcutLevel } from "@web/shortcuts/level/read-browser-shortcut-level";
import { type ShortcutRegistryId } from "@web/shortcuts/shortcuts.registry";
import { readShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import { readTipsMuted } from "@web/shortcuts/tips/shortcut-tips-muted.store";

export const MAX_POINTER_HINTS_PER_SESSION = 3;

/**
 * The environment gates every pointer hint shares, defaulted from storage so a
 * caller only passes what it already has in hand (the pill store, mainly).
 */
export type PointerHintGateOverrides = {
  tipsMuted?: boolean;
  tipsDismissedPermanently?: boolean;
  appLocked?: boolean;
  pillVisible?: boolean;
  usageProfile?: ReturnType<typeof readShortcutUsageProfile>;
};

export type ShouldTeachPointerHintInput = PointerHintGateOverrides & {
  /** No hint once the profile records this id as invoked (retire on use). */
  shortcutId: ShortcutRegistryId;
  /** True when this signal already taught this session (once per signal). */
  alreadyShown: boolean;
  hintsShownThisSession: number;
};

/**
 * The one teach gate behind every pointer hint: grid intents, chrome clicks,
 * form field clicks, and the right-click `m` tip. The rules it enforces are
 * documented in `docs/frontend/contextual-pointer-guidance.md`; keeping them in
 * a single function is what stops one surface from quietly teaching past a
 * mute, the session cap, or the Explorer retirement the others respect.
 */
export function shouldTeachPointerHint({
  shortcutId,
  alreadyShown,
  hintsShownThisSession,
  tipsMuted = readTipsMuted(),
  tipsDismissedPermanently = readPointerHintDismissedPermanently(),
  appLocked = isAppLocked(),
  pillVisible = false,
  usageProfile = readShortcutUsageProfile(),
}: ShouldTeachPointerHintInput): boolean {
  if (hasReachedExplorerShortcutLevel(usageProfile)) return false;
  if (tipsMuted || tipsDismissedPermanently || appLocked || pillVisible) {
    return false;
  }
  if (alreadyShown) return false;
  if (hintsShownThisSession >= MAX_POINTER_HINTS_PER_SESSION) return false;
  const usage = usageProfile.shortcuts[shortcutId];
  return !(usage && usage.invocations > 0);
}
