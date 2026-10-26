import {
  arePointerHintEnvironmentGatesClosed,
  type PointerHintGateOverrides,
  shouldTeachPointerHint,
} from "@web/shortcuts/pointer-intent/pointer-hint.teach-policy";
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
 * Grid intents other than empty-slot clicks teach once per session and retire
 * on the first registry id they name. Empty-grid clicks reuse the shared
 * mute/lock/pill gates and skip Explorer, session cap, and retire-on-use.
 */
export function shouldTeachPointerIntent({
  intent,
  session,
  ...gates
}: ShouldTeachPointerIntentInput): boolean {
  if (isEmptyGridEveryClickIntent(intent)) {
    return !arePointerHintEnvironmentGatesClosed(gates);
  }

  return shouldTeachPointerHint({
    ...gates,
    shortcutId: INTENT_TEACHING[intent].shortcutIds[0],
    alreadyShown: session.shownIntents.has(intent),
    hintsShownThisSession: session.hintsShownThisSession,
  });
}
