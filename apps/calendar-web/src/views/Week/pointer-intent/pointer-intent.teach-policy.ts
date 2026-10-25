import { isAppLocked } from "@web/shortcuts/app-lock";
import { readPointerHintDismissedPermanently } from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import {
  type PointerHintGateOverrides,
  shouldTeachPointerHint,
} from "@web/shortcuts/pointer-intent/pointer-hint.teach-policy";
import { readTipsMuted } from "@web/shortcuts/tips/shortcut-tips-muted.store";
import {
  INTENT_TEACHING,
  type PointerIntent,
} from "@web/views/Week/pointer-intent/pointer-intent";
import { type PointerIntentSessionSnapshot } from "@web/views/Week/pointer-intent/pointer-intent.session";

export type ShouldTeachPointerIntentInput = PointerHintGateOverrides & {
  intent: PointerIntent;
  session: PointerIntentSessionSnapshot;
};

const EMPTY_GRID_EVERY_CLICK_INTENTS = new Set<PointerIntent>([
  "slot-click",
  "allday-click",
]);

function isEmptyGridEveryClickIntent(intent: PointerIntent): boolean {
  return EMPTY_GRID_EVERY_CLICK_INTENTS.has(intent);
}

/**
 * Empty timed and all-day grid clicks teach on every click (Mac parity). Only
 * mute, permanent dismiss, app lock, and a visible pill block them.
 */
function shouldTeachEmptyGridClickIntent(
  gates: PointerHintGateOverrides,
): boolean {
  const tipsMuted = gates.tipsMuted ?? readTipsMuted();
  const tipsDismissedPermanently =
    gates.tipsDismissedPermanently ?? readPointerHintDismissedPermanently();
  const appLocked = gates.appLocked ?? isAppLocked();
  const pillVisible = gates.pillVisible ?? false;

  if (tipsMuted || tipsDismissedPermanently || appLocked || pillVisible) {
    return false;
  }
  return true;
}

/**
 * Grid intents other than empty-slot clicks teach once per session and retire
 * on the first registry id they name; every other rule lives in the shared
 * pointer-hint gate.
 */
export function shouldTeachPointerIntent({
  intent,
  session,
  ...gates
}: ShouldTeachPointerIntentInput): boolean {
  if (isEmptyGridEveryClickIntent(intent)) {
    return shouldTeachEmptyGridClickIntent(gates);
  }

  return shouldTeachPointerHint({
    ...gates,
    shortcutId: INTENT_TEACHING[intent].shortcutIds[0],
    alreadyShown: session.shownIntents.has(intent),
    hintsShownThisSession: session.hintsShownThisSession,
  });
}
