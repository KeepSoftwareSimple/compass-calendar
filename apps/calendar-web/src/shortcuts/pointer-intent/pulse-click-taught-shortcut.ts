import { track } from "@web/auth/posthog/track";
import { isAppLocked } from "@web/shortcuts/app-lock";
import { REGISTRY_RUNTIME_KEY_SOURCES } from "@web/shortcuts/app-shortcut-bindings";
import { readPointerHintDismissedPermanently } from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import {
  pointerHintActions,
  selectPointerHintVisible,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { type ShortcutRegistryId } from "@web/shortcuts/shortcuts.registry";
import { readShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import { viewFromPathname } from "@web/shortcuts/tips/shortcut-telemetry";
import { readTipsMuted } from "@web/shortcuts/tips/shortcut-tips-muted.store";
import { MAX_POINTER_HINTS_PER_SESSION } from "@web/views/Week/pointer-intent/pointer-intent";
import {
  getPointerIntentSessionSnapshot,
  hasShownClickTaughtShortcut,
  markClickTaughtShortcutShown,
} from "@web/views/Week/pointer-intent/pointer-intent.session";

export type PulseClickTaughtShortcutOptions = {
  message?: string;
};

/** Teach a registry shortcut after a real pointer click on chrome or form controls. */
export function pulseClickTaughtShortcut(
  shortcutId: ShortcutRegistryId,
  options: PulseClickTaughtShortcutOptions = {},
): void {
  if (
    readTipsMuted() ||
    readPointerHintDismissedPermanently() ||
    isAppLocked()
  ) {
    return;
  }
  if (selectPointerHintVisible(usePointerHintStore.getState())) return;
  if (hasShownClickTaughtShortcut(shortcutId)) return;

  const session = getPointerIntentSessionSnapshot();
  if (session.hintsShownThisSession >= MAX_POINTER_HINTS_PER_SESSION) return;

  const usage = readShortcutUsageProfile().shortcuts[shortcutId];
  if (usage && usage.invocations > 0) return;

  const keys = REGISTRY_RUNTIME_KEY_SOURCES[shortcutId];
  if (!keys?.length) return;

  markClickTaughtShortcutShown(shortcutId);
  pointerHintActions.pulse({
    source: "pointer",
    shortcutKey: [...keys],
    ...(options.message ? { message: options.message } : {}),
  });
  track("pointer_hint_shown", {
    intent: "chrome-click",
    shortcut_id: shortcutId,
    source: "pointer",
    view: viewFromPathname(globalThis.location?.pathname ?? "/"),
  });
}
