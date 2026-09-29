import {
  INTENT_TEACHING,
  type IntentMessageContext,
  type PointerIntent,
  type ShortcutKeysLookup,
  teachingKeysForIntent,
} from "@web/shortcuts/pointer-intent/pointer-intent";
import {
  getPointerIntentSessionSnapshot,
  markPointerIntentHintShown,
  recordPointerIntentDetection,
} from "@web/shortcuts/pointer-intent/pointer-intent.session";
import { shouldTeachPointerIntent } from "@web/shortcuts/pointer-intent/pointer-intent.teach-policy";
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
    { lookup, ctx: _ctx = {}, pathname }: NotifyPointerIntentOptions = {},
  ): void {
    const keysLookup = resolveLookup(lookup);
    recordPointerIntentDetection(intent);
    const view = viewForTelemetry(pathname);

    void import("@web/auth/posthog/posthog.bootstrap").then(
      ({ getPosthogClient }) => {
        getPosthogClient()?.capture("pointer_intent_detected", { intent, view });
      },
    );

    void import("@web/shortcuts/keyboard-only/pointer-hint.store").then(
      ({
        pointerHintActions,
        selectPointerHintVisible,
        usePointerHintStore,
      }) => {
        const session = getPointerIntentSessionSnapshot();
        const pillVisible = selectPointerHintVisible(
          usePointerHintStore.getState(),
        );
        if (!shouldTeachPointerIntent({ intent, session, pillVisible })) {
          return;
        }

        const teaching = INTENT_TEACHING[intent];
        const keys = teachingKeysForIntent(intent, keysLookup);
        const shortcutKey = keys[0] ?? [];

        pointerHintActions.pulse({
          source: "pointer",
          shortcutKey,
        });
        markPointerIntentHintShown(intent);
        void import("@web/auth/posthog/track").then(({ track }) => {
          track("pointer_hint_shown", {
            intent,
            shortcut_id: teaching.shortcutIds[0],
            view,
            source: "pointer",
          });
        });
      },
    );
  },
};
