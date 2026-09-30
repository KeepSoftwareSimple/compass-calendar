import { ID_GRID_MAIN } from "@web/common/constants/web.constants";
import { requestPointerEventJump } from "@web/shortcuts/keyboard-only/pointer-grid-bridge";
import { eventJumpActions } from "@web/shortcuts/shift-hint/event-jump.store";
import { gridPointerTargetFromEvent } from "@web/views/Week/pointer-intent/grid-pointer-target";
import {
  identityForHoverTarget,
  interactiveTargetUnderPointer,
} from "@web/views/Week/pointer-intent/hover-hunt.util";
import {
  type IntentMessageContext,
  type PointerIntent,
} from "@web/views/Week/pointer-intent/pointer-intent";
import { pointerIntentActions } from "@web/views/Week/pointer-intent/pointer-intent.actions";

const CARD_DRAG_THRESHOLD_PX = 8;
const HOVER_HUNT_SAMPLE_MS = 100;
const HOVER_HUNT_WINDOW_MS = 4000;
const HOVER_HUNT_MIN_TARGETS = 3;
const WHEEL_GESTURE_IDLE_MS = 180;
const WHEEL_GESTURE_WINDOW_MS = 10_000;
const GRID_SCROLL_MIN_GESTURES = 3;

type PendingCardPress = {
  eventId: string;
  startX: number;
  startY: number;
  dragHintShown: boolean;
};

/** Capture-phase grid tracker. WeekView mounts it after the calendar shell paints. */
export function attachPointerIntentTracker(): () => void {
  let pendingCard: PendingCardPress | null = null;
  let wheelGestureStarts: number[] = [];
  let lastWheelAt = 0;

  let hoverHuntWindowStart = 0;
  let hoverHuntLastSampleAt = 0;
  const hoverHuntTargets = new Set<string>();

  const resetHoverHunt = () => {
    hoverHuntWindowStart = 0;
    hoverHuntLastSampleAt = 0;
    hoverHuntTargets.clear();
  };

  const notify = (intent: PointerIntent, ctx?: IntentMessageContext) => {
    pointerIntentActions.notify(intent, ctx);
  };

  const onHoverHuntCancel = () => {
    resetHoverHunt();
  };

  const onHoverHuntPointerMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    const now = Date.now();
    if (now - hoverHuntLastSampleAt < HOVER_HUNT_SAMPLE_MS) return;
    hoverHuntLastSampleAt = now;

    const target = interactiveTargetUnderPointer(event.clientX, event.clientY);
    if (!target) return;

    if (hoverHuntWindowStart === 0) {
      hoverHuntWindowStart = now;
    } else if (now - hoverHuntWindowStart > HOVER_HUNT_WINDOW_MS) {
      resetHoverHunt();
      hoverHuntWindowStart = now;
      hoverHuntLastSampleAt = now;
    }

    hoverHuntTargets.add(identityForHoverTarget(target));
    if (hoverHuntTargets.size < HOVER_HUNT_MIN_TARGETS) return;

    resetHoverHunt();
    notify("hover-hunt");
  };

  const onPointerDown = (event: PointerEvent) => {
    onHoverHuntCancel();
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
  document.addEventListener("pointermove", onHoverHuntPointerMove, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerUp, true);
  document.addEventListener("keydown", onHoverHuntCancel, true);
  document.addEventListener("wheel", onWheel, { capture: true, passive: true });

  return () => {
    pendingCard = null;
    wheelGestureStarts = [];
    lastWheelAt = 0;
    resetHoverHunt();
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("pointermove", onHoverHuntPointerMove, true);
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("pointercancel", onPointerUp, true);
    document.removeEventListener("keydown", onHoverHuntCancel, true);
    document.removeEventListener("wheel", onWheel, true);
  };
}
