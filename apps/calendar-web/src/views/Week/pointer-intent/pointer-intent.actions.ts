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

const HOVER_HUNT_CHIP_MS = 2_000;

let registeredKeysLookup: ShortcutKeysLookup = () => undefined;
let hoverHuntChipTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

export function registerPointerIntentKeysLookup(
  lookup: ShortcutKeysLookup,
): void {
  registeredKeysLookup = lookup;
}

export function resetPointerIntentKeysLookupForTests(): void {
  registeredKeysLookup = () => undefined;
}

export function resetHoverHuntChipTimerForTests(): void {
  if (hoverHuntChipTimer !== undefined) {
    globalThis.clearTimeout(hoverHuntChipTimer);
    hoverHuntChipTimer = undefined;
  }
}

function scheduleHoverHuntChipHide(): void {
  if (hoverHuntChipTimer !== undefined) {
    globalThis.clearTimeout(hoverHuntChipTimer);
  }
  hoverHuntChipTimer = globalThis.setTimeout(() => {
    hoverHuntChipTimer = undefined;
    pageJumpHintActions.setHintsVisible(false);
  }, HOVER_HUNT_CHIP_MS);
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
    const shortcutKey =
      intent === "hover-hunt"
        ? ([...(keysLookup("focus-page-jump") ?? ["Mod"])] as string[])
        : (keys[0] ?? []);

    if (intent === "hover-hunt" && !isEventFormOpen()) {
      pageJumpHintActions.setHintsVisible(true);
      scheduleHoverHuntChipHide();
    }

    pointerHintActions.pulse({
      source: "pointer",
      shortcutKey,
      message: teachingMessageForIntent(intent, _ctx),
      keys,
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
