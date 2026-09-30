import { expandModInShortcutDisplay } from "@web/shortcuts/shortcut.util";
import { type ShortcutRegistryId } from "@web/shortcuts/shortcuts.registry";

export type PointerIntent =
  | "card-click"
  | "slot-click"
  | "allday-click"
  | "card-drag"
  | "grid-scroll"
  | "swipe-next"
  | "swipe-prev"
  | "hover-hunt";

function modHoldLabelForHint(): string {
  return expandModInShortcutDisplay("Mod") === "Meta" ? "Cmd" : "Ctrl";
}

export type SlotClickIntentContext = {
  timeKey: string;
  timeLabel: string;
};

export type IntentMessageContext = Partial<SlotClickIntentContext>;

export type IntentTeaching = {
  shortcutIds: readonly ShortcutRegistryId[];
  message: (ctx: IntentMessageContext) => string;
};

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
  "hover-hunt": {
    shortcutIds: ["focus-page-jump"],
    message: () => `Hold ${modHoldLabelForHint()} to see where you can jump.`,
  },
};

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
