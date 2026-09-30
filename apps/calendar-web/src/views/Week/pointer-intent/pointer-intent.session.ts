import { type ShortcutRegistryId } from "@web/shortcuts/shortcuts.registry";
import { type PointerIntent } from "@web/views/Week/pointer-intent/pointer-intent";

const shownIntents = new Set<PointerIntent>();
const shownClickTaughtShortcutIds = new Set<ShortcutRegistryId>();
let hintsShownThisSession = 0;
const detectedIntentLog: PointerIntent[] = [];

export type PointerIntentSessionSnapshot = {
  shownIntents: ReadonlySet<PointerIntent>;
  hintsShownThisSession: number;
};

export function getPointerIntentSessionSnapshot(): PointerIntentSessionSnapshot {
  return {
    shownIntents,
    hintsShownThisSession,
  };
}

export function recordPointerIntentDetection(intent: PointerIntent): void {
  detectedIntentLog.push(intent);
}

/** Intents classified this session (WP-06 newcomer tip ranking). */
export function detectedIntents(): readonly PointerIntent[] {
  return detectedIntentLog;
}

export function markPointerIntentHintShown(intent: PointerIntent): void {
  shownIntents.add(intent);
  hintsShownThisSession += 1;
}

export function hasShownClickTaughtShortcut(
  shortcutId: ShortcutRegistryId,
): boolean {
  return shownClickTaughtShortcutIds.has(shortcutId);
}

export function markClickTaughtShortcutShown(
  shortcutId: ShortcutRegistryId,
): void {
  if (shownClickTaughtShortcutIds.has(shortcutId)) return;
  shownClickTaughtShortcutIds.add(shortcutId);
  hintsShownThisSession += 1;
}

export function resetPointerIntentSessionForTests(): void {
  shownIntents.clear();
  shownClickTaughtShortcutIds.clear();
  hintsShownThisSession = 0;
  detectedIntentLog.length = 0;
}
