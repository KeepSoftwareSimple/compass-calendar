import { getPosthogClient } from "@web/auth/posthog/posthog.bootstrap";
import { track } from "@web/auth/posthog/track";
import { isEventFormOpen } from "@web/events/stores/draft.store";
import {
  pointerHintActions,
  selectPointerHintVisible,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { pageJumpHintActions } from "@web/shortcuts/page-jump/page-jump.store";
import { viewFromPathname } from "@web/shortcuts/tips/shortcut-telemetry";
import {
  INTENT_TEACHING,
  type IntentMessageContext,
  type PointerIntent,
  type ShortcutKeysLookup,
  teachingKeysForIntent,
  teachingMessageForIntent,
} from "@web/views/Week/pointer-intent/pointer-intent";
import {
  getPointerIntentSessionSnapshot,
  markPointerIntentHintShown,
  recordPointerIntentDetection,
} from "@web/views/Week/pointer-intent/pointer-intent.session";
import { shouldTeachPointerIntent } from "@web/views/Week/pointer-intent/pointer-intent.teach-policy";

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

const PAGE_JUMP_CHIP_DEMO_MS = 2000;

let pageJumpChipDemoTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

function clearPageJumpChipDemoTimer(): void {
  if (pageJumpChipDemoTimer !== undefined) {
    globalThis.clearTimeout(pageJumpChipDemoTimer);
    pageJumpChipDemoTimer = undefined;
  }
}

function revealPageJumpChipsBriefly(): void {
  clearPageJumpChipDemoTimer();
  pageJumpHintActions.setHintsVisible(true);
  pageJumpChipDemoTimer = globalThis.setTimeout(() => {
    pageJumpChipDemoTimer = undefined;
    pageJumpHintActions.setHintsVisible(false);
  }, PAGE_JUMP_CHIP_DEMO_MS);
}

export function resetPageJumpChipDemoForTests(): void {
  clearPageJumpChipDemoTimer();
  pageJumpHintActions.reset();
}

export const pointerIntentActions = {
  notify(
    intent: PointerIntent,
    { lookup, ctx = {}, pathname }: NotifyPointerIntentOptions = {},
  ): void {
    const keysLookup = resolveLookup(lookup);
    recordPointerIntentDetection(intent);
    const view = viewForTelemetry(pathname);

    getPosthogClient()?.capture("pointer_intent_detected", { intent, view });

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
    const message = teachingMessageForIntent(intent, ctx);

    pointerHintActions.pulse({
      source: "pointer",
      shortcutKey,
      ...(message ? { message } : {}),
    });
    if (intent === "hover-hunt" && !isEventFormOpen()) {
      revealPageJumpChipsBriefly();
    }
    markPointerIntentHintShown(intent);
    track("pointer_hint_shown", {
      intent,
      shortcut_id: teaching.shortcutIds[0],
      view,
      source: "pointer",
    });
  },
};
