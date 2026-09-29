import { ID_GRID_MAIN } from "@web/common/constants/web.constants";
import { requestPointerEventJump } from "@web/shortcuts/keyboard-only/pointer-grid-bridge";
import { gridPointerTargetFromEvent } from "@web/shortcuts/pointer-intent/grid-pointer-target";
import {
  type IntentMessageContext,
  type PointerIntent,
} from "@web/shortcuts/pointer-intent/pointer-intent";
import {
  pointerIntentActions,
  registerPointerIntentKeysLookup,
  resetPointerIntentKeysLookupForTests,
} from "@web/shortcuts/pointer-intent/pointer-intent.actions";
import { pointerIntentKeysLookup } from "@web/shortcuts/pointer-intent/pointer-intent.keys-lookup";
import { eventJumpActions } from "@web/shortcuts/shift-hint/event-jump.store";

const CARD_DRAG_THRESHOLD_PX = 8;
const WHEEL_GESTURE_IDLE_MS = 180;
const WHEEL_GESTURE_WINDOW_MS = 10_000;
const GRID_SCROLL_MIN_GESTURES = 3;

type PendingCardPress = {
  eventId: string;
  startX: number;
  startY: number;
  dragHintShown: boolean;
};

/** Imperative grid tracker for dynamic import from RootShell (keeps boot set small). */
export function attachPointerIntentTracker(): () => void {
  registerPointerIntentKeysLookup(pointerIntentKeysLookup);

  let pendingCard: PendingCardPress | null = null;
  let wheelGestureStarts: number[] = [];
  let lastWheelAt = 0;

  const notify = (intent: PointerIntent, ctx?: IntentMessageContext) => {
    pointerIntentActions.notify(intent, { ctx });
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const target = gridPointerTargetFromEvent(event);
    if (!target) return;

    if (target.kind === "card") {
      pendingCard = {
        eventId: target.eventId,
        startX: event.clientX,
        startY: event.clientY,
        dragHintShown: false,
      };
      return;
    }

    pendingCard = null;
    if (target.kind === "timed-slot") {
      eventJumpActions.setPointerDraftIntent({
        date: target.intent.date,
        start: target.intent.start,
        timeKey: target.intent.timeKey,
      });
      notify("slot-click", {
        timeKey: target.intent.timeKey ?? "",
        timeLabel: target.intent.timeLabel ?? "",
      });
      return;
    }

    if (target.kind === "allday-slot") {
      eventJumpActions.setPointerDraftIntent({ date: target.date });
      notify("allday-click");
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!pendingCard || pendingCard.dragHintShown) return;
    const dx = event.clientX - pendingCard.startX;
    const dy = event.clientY - pendingCard.startY;
    if (Math.hypot(dx, dy) < CARD_DRAG_THRESHOLD_PX) return;
    pendingCard.dragHintShown = true;
    notify("card-drag");
  };

  const onPointerUp = () => {
    if (!pendingCard) return;
    const { eventId, dragHintShown } = pendingCard;
    pendingCard = null;
    if (dragHintShown) return;
    requestPointerEventJump(eventId);
    notify("card-click");
  };

  const onWheel = (event: WheelEvent) => {
    const grid = document.getElementById(ID_GRID_MAIN);
    if (!grid?.contains(event.target as Node)) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

    const now = Date.now();
    if (
      wheelGestureStarts.length === 0 ||
      now - lastWheelAt > WHEEL_GESTURE_IDLE_MS
    ) {
      wheelGestureStarts.push(now);
    }
    lastWheelAt = now;
    wheelGestureStarts = wheelGestureStarts.filter(
      (startedAt) => now - startedAt < WHEEL_GESTURE_WINDOW_MS,
    );
    if (wheelGestureStarts.length < GRID_SCROLL_MIN_GESTURES) return;
    wheelGestureStarts = [];
    notify("grid-scroll");
  };

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerUp, true);
  document.addEventListener("wheel", onWheel, { capture: true, passive: true });

  return () => {
    pendingCard = null;
    wheelGestureStarts = [];
    lastWheelAt = 0;
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("pointercancel", onPointerUp, true);
    document.removeEventListener("wheel", onWheel, true);
    resetPointerIntentKeysLookupForTests();
  };
}
