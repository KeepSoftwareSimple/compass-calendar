import { track } from "@web/auth/posthog/track";
import { REGISTRY_RUNTIME_KEY_SOURCES } from "@web/shortcuts/app-shortcut-bindings";
import {
  pointerHintActions,
  selectPointerHintVisible,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { shouldTeachClickTaughtShortcut } from "@web/shortcuts/pointer-intent/click-taught-shortcut.teach-policy";
import { type ShortcutRegistryId } from "@web/shortcuts/shortcuts.registry";
import { viewFromPathname } from "@web/shortcuts/tips/shortcut-telemetry";
import {
  getPointerIntentSessionSnapshot,
  markClickTaughtHintShown,
} from "@web/views/Week/pointer-intent/pointer-intent.session";

export type PulseClickTaughtShortcutOptions = {
  pathname?: string;
  /** Overrides registry keycaps for the pill (e.g. Mod+digit for one field). */
  shortcutKey?: string | string[];
  /** Custom status copy; default pill uses "Next time, press" + shortcutKey. */
  message?: string;
  keys?: string[][];
};

export function pulseClickTaughtShortcut(
  shortcutId: ShortcutRegistryId,
  {
    pathname = globalThis.location?.pathname ?? "/",
    shortcutKey,
    message,
    keys,
  }: PulseClickTaughtShortcutOptions = {},
): void {
  const session = getPointerIntentSessionSnapshot();
  const pillVisible = selectPointerHintVisible(usePointerHintStore.getState());
  if (!shouldTeachClickTaughtShortcut({ shortcutId, session, pillVisible })) {
    return;
  }

  const registryKeys = REGISTRY_RUNTIME_KEY_SOURCES[shortcutId];
  const resolvedShortcutKey =
    shortcutKey ?? (registryKeys ? [...registryKeys] : undefined);
  if (!resolvedShortcutKey) return;

  pointerHintActions.pulse({
    source: "pointer",
    shortcutKey: resolvedShortcutKey,
    message,
    keys,
  });
  markClickTaughtHintShown(shortcutId);
  track("pointer_hint_shown", {
    intent: "chrome-click",
    shortcut_id: shortcutId,
    view: viewFromPathname(pathname),
    source: "pointer",
  });
}
