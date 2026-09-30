import {
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

/**
 * A grid intent teaches once per session and retires on the first registry id
 * it names; every other rule lives in the shared pointer-hint gate.
 */
export function shouldTeachPointerIntent({
  intent,
  session,
  ...gates
}: ShouldTeachPointerIntentInput): boolean {
  return shouldTeachPointerHint({
    ...gates,
    shortcutId: INTENT_TEACHING[intent].shortcutIds[0],
    alreadyShown: session.shownIntents.has(intent),
    hintsShownThisSession: session.hintsShownThisSession,
  });
}
