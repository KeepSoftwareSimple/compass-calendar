import { isAppLocked } from "@web/shortcuts/app-lock";
import { readPointerHintDismissedPermanently } from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import {
  selectPointerHintVisible,
  usePointerHintStore,
} from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { type PointerIntentSessionSnapshot } from "@web/shortcuts/pointer-intent/pointer-intent.session";
import { type ShortcutRegistryId } from "@web/shortcuts/shortcuts.registry";
import { readShortcutUsageProfile } from "@web/shortcuts/tips/shortcut-personalization.storage";
import { readTipsMuted } from "@web/shortcuts/tips/shortcut-tips-muted.store";

export type PointerIntent =
  | "card-click"
  | "slot-click"
  | "allday-click"
  | "card-drag"
  | "grid-scroll"
  | "swipe-next"
  | "swipe-prev";

export type SlotClickIntentContext = {
  timeKey: string;
  timeLabel: string;
};

export type IntentMessageContext = Partial<SlotClickIntentContext>;

export type IntentTeaching = {
  shortcutIds: readonly ShortcutRegistryId[];
  message: (ctx: IntentMessageContext) => string;
};

export const MAX_POINTER_HINTS_PER_SESSION = 3;

export const INTENT_TEACHING: Record<PointerIntent, IntentTeaching> = {
  "card-click": {
    shortcutIds: ["edit-open", "focus-shift-hold"],
    message: () => "Press {0} to open. Hold {1} to jump to any event.",
  },
  "slot-click": {
    shortcutIds: ["create-typed-time", "create-timed"],
    message: (ctx) =>
      `Type ${ctx.timeKey ?? ""} to create at ${ctx.timeLabel ?? ""}, or press {1}.`,
  },
  "allday-click": {
    shortcutIds: ["create-allday"],
    message: () => "Press {0} for an all-day event.",
  },
  "card-drag": {
    shortcutIds: ["edit-move-later", "edit-move-hour-later"],
    message: () => "{0} moves 15 min. {1} moves an hour.",
  },
  "grid-scroll": {
    shortcutIds: ["nav-scroll-hour-down", "nav-today"],
    message: () => "{0} scrolls an hour. {1} jumps to now.",
  },
  "swipe-next": {
    shortcutIds: ["nav-next"],
    message: () => "Next time, press {0}.",
  },
  "swipe-prev": {
    shortcutIds: ["nav-previous"],
    message: () => "Next time, press {0}.",
  },
};

export type ShouldTeachPointerIntentInput = {
  intent: PointerIntent;
  session: PointerIntentSessionSnapshot;
  tipsMuted?: boolean;
  tipsDismissedPermanently?: boolean;
  appLocked?: boolean;
  pillVisible?: boolean;
  usageProfile?: ReturnType<typeof readShortcutUsageProfile>;
};

export function shouldTeachPointerIntent({
  intent,
  session,
  tipsMuted = readTipsMuted(),
  tipsDismissedPermanently = readPointerHintDismissedPermanently(),
  appLocked = isAppLocked(),
  pillVisible = selectPointerHintVisible(usePointerHintStore.getState()),
  usageProfile = readShortcutUsageProfile(),
}: ShouldTeachPointerIntentInput): boolean {
  if (tipsMuted || tipsDismissedPermanently || appLocked || pillVisible) {
    return false;
  }
  if (session.shownIntents.has(intent)) return false;
  if (session.hintsShownThisSession >= MAX_POINTER_HINTS_PER_SESSION) {
    return false;
  }
  const retirementId = INTENT_TEACHING[intent].shortcutIds[0];
  const usage = usageProfile.shortcuts[retirementId];
  if (usage && usage.invocations > 0) return false;
  return true;
}

export type ShortcutKeysLookup = (
  shortcutId: ShortcutRegistryId,
) => readonly string[] | undefined;

export function teachingKeysForIntent(
  intent: PointerIntent,
  lookup: ShortcutKeysLookup,
): string[][] {
  return INTENT_TEACHING[intent].shortcutIds.map((id) => [
    ...(lookup(id) ?? []),
  ]);
}

export function teachingMessageForIntent(
  intent: PointerIntent,
  ctx: IntentMessageContext = {},
): string {
  return INTENT_TEACHING[intent].message(ctx);
}
