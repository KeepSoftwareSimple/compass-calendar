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
  teachingKeysForIntent,
  teachingMessageForIntent,
} from "@web/views/Week/pointer-intent/pointer-intent";
import { pointerIntentKeysLookup } from "@web/views/Week/pointer-intent/pointer-intent.keys-lookup";
import {
  getPointerIntentSessionSnapshot,
  markPointerIntentHintShown,
  recordPointerIntentDetection,
} from "@web/views/Week/pointer-intent/pointer-intent.session";
import { shouldTeachPointerIntent } from "@web/views/Week/pointer-intent/pointer-intent.teach-policy";

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
  notify(intent: PointerIntent, ctx: IntentMessageContext = {}): void {
    recordPointerIntentDetection(intent);
    const view = viewFromPathname(window.location.pathname);

    getPosthogClient()?.capture("pointer_intent_detected", { intent, view });

    const session = getPointerIntentSessionSnapshot();
    const pillVisible = selectPointerHintVisible(
      usePointerHintStore.getState(),
    );
    if (!shouldTeachPointerIntent({ intent, session, pillVisible })) {
      return;
    }

    const teaching = INTENT_TEACHING[intent];
    const keys = teachingKeysForIntent(intent, pointerIntentKeysLookup);
    const shortcutKey = keys[0] ?? [];
    const message = teachingMessageForIntent(intent, ctx);

    pointerHintActions.pulse({
      source: "pointer",
      shortcutKey,
      ...(message ? { message, keys } : {}),
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
