import { track } from "@web/auth/posthog/track";
import { pointerHintActions } from "@web/shortcuts/keyboard-only/pointer-hint.store";
import {
  INTENT_TEACHING,
  type IntentMessageContext,
  type PointerIntent,
  type ShortcutKeysLookup,
  shouldTeachPointerIntent,
  teachingKeysForIntent,
  teachingMessageForIntent,
} from "@web/shortcuts/pointer-intent/pointer-intent";
import {
  getPointerIntentSessionSnapshot,
  markPointerIntentHintShown,
  recordPointerIntentDetection,
} from "@web/shortcuts/pointer-intent/pointer-intent.session";
import { viewFromPathname } from "@web/shortcuts/tips/shortcut-telemetry";

export type NotifyPointerIntentOptions = {
  lookup?: ShortcutKeysLookup;
  ctx?: IntentMessageContext;
  pathname?: string;
};

let registeredKeysLookup: ShortcutKeysLookup = () => undefined;

export function registerPointerIntentKeysLookup(
  lookup: ShortcutKeysLookup,
): void {
  registeredKeysLookup = lookup;
}

export function resetPointerIntentKeysLookupForTests(): void {
  registeredKeysLookup = () => undefined;
}

function resolveLookup(lookup?: ShortcutKeysLookup): ShortcutKeysLookup {
  return lookup ?? registeredKeysLookup;
}

function viewForTelemetry(pathname = window.location.pathname): string {
  return viewFromPathname(pathname);
}

export const pointerIntentActions = {
  notify(
    intent: PointerIntent,
    { lookup, ctx = {}, pathname }: NotifyPointerIntentOptions = {},
  ): void {
    const keysLookup = resolveLookup(lookup);
    recordPointerIntentDetection(intent);
    const view = viewForTelemetry(pathname);
    track("pointer_intent_detected", { intent, view });

    const session = getPointerIntentSessionSnapshot();
    if (!shouldTeachPointerIntent({ intent, session })) return;

    const teaching = INTENT_TEACHING[intent];
    const keys = teachingKeysForIntent(intent, keysLookup);
    const message = teachingMessageForIntent(intent, ctx);
    const shortcutKey = keys[0] ?? [];

    pointerHintActions.pulse({
      source: "pointer",
      message,
      keys,
      shortcutKey,
    });
    markPointerIntentHintShown(intent);
    track("pointer_hint_shown", {
      intent,
      shortcut_id: teaching.shortcutIds[0],
      view,
      source: "pointer",
    });
  },
};
