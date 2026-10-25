import {
  firstHintShortcutCelebrationKey,
  type HintShortcutCelebrationKey,
} from "@core/shortcuts/hint-shortcut-celebration.util";
import { track } from "@web/auth/posthog/track";
import { claimHintShortcutCelebration } from "@web/shortcuts/tips/hint-shortcut-celebration.storage";
import { hintShortcutCelebrationActions } from "@web/shortcuts/tips/hint-shortcut-celebration.store";
import {
  getShortcutHint,
  type ShortcutHintId,
} from "@web/shortcuts/tips/shortcut-tips.data";
import { readVisibleHintCelebrationKeys } from "@web/shortcuts/tips/visible-shortcut-hint.store";

export function tryCelebrateHintShortcutUse(
  celebrationKey: HintShortcutCelebrationKey,
): void {
  const visibleKeys = readVisibleHintCelebrationKeys();
  if (!visibleKeys.includes(celebrationKey)) return;
  if (!claimHintShortcutCelebration(celebrationKey)) return;

  hintShortcutCelebrationActions.pulse(celebrationKey);
  track("hint_shortcut_first_used", { shortcut: celebrationKey });
}

export function tryCelebrateHintShortcutForHintId(
  hintId: ShortcutHintId,
): void {
  const key = firstHintShortcutCelebrationKey(
    hintId,
    getShortcutHint(hintId).parts,
  );
  if (!key) return;
  tryCelebrateHintShortcutUse(key);
}
