import { useEffect, useRef } from "react";
import { track } from "@web/auth/posthog/track";
import {
  type BlockedPointerAttempt,
  POINTER_PASS_ATTRIBUTE,
  pointerActionKeys,
  pointerGridIntentFromPointer,
  requestPointerEventJump,
  requestPointerGridCreate,
  teachingFromBlockedPointer,
} from "@web/shortcuts/keyboard-only/pointer-action";
import { readPointerHintDismissedPermanently } from "@web/shortcuts/keyboard-only/pointer-hint.storage";
import { pointerHintActions } from "@web/shortcuts/keyboard-only/pointer-hint.store";
import { eventJumpActions } from "@web/shortcuts/shift-hint/event-jump.store";
import { viewFromPathname } from "@web/shortcuts/tips/shortcut-telemetry";

const PRIMARY_BUTTON = 0;

const closestElement = (target: EventTarget | null): Element | null =>
  target instanceof Element ? target : null;

const isEditableTarget = (element: Element): boolean =>
  element.closest(
    "input, textarea, select, [contenteditable='true'], [contenteditable='']",
  ) !== null;

const isPassTarget = (element: Element): boolean =>
  element.closest(`[${POINTER_PASS_ATTRIBUTE}]`) !== null;

/** Native controls run their own click handler; the hint only adds a tip. */
const isWorkingControl = (element: Element): boolean =>
  element.closest("button, a[href]") !== null;

type Teaching = {
  attempt: BlockedPointerAttempt;
  jumpEventId?: string;
  gridIntent?: ReturnType<typeof pointerGridIntentFromPointer>;
};

const resolveTeaching = (event: PointerEvent): Teaching | null => {
  const element = closestElement(event.target);
  if (!element) return null;
  if (isPassTarget(element) || isEditableTarget(element)) return null;

  const path = event.composedPath() as EventTarget[];
  const { attempt: base, jumpEventId } = teachingFromBlockedPointer(
    path,
    PRIMARY_BUTTON,
  );

  if (isWorkingControl(element)) {
    const keys = base.shortcutKey ?? pointerActionKeys(base.actionId);
    // A working control with nothing to teach stays silent.
    if (!keys) return null;
    return {
      attempt: {
        ...base,
        shortcutKey: typeof keys === "string" ? keys : [...keys],
        performed: true,
      },
    };
  }

  if (base.actionId === "unknown" && !base.shortcutKey) {
    const gridIntent = pointerGridIntentFromPointer(
      path,
      event.clientX,
      event.clientY,
    );
    if (gridIntent) {
      return {
        attempt: {
          actionId: gridIntent.kind === "timed" ? "grid.timed" : "grid.all-day",
          gridDate: gridIntent.date,
          gridTimeKey: gridIntent.timeKey,
          gridTimeLabel: gridIntent.timeLabel,
          performed: false,
        },
        gridIntent,
      };
    }
    // Whitespace is silent; something that looks clickable gets the
    // generic keyboard fallback.
    if (element.closest("[role='button']") === null) return null;
    return { attempt: { actionId: "unknown", performed: false } };
  }

  return { attempt: { ...base, performed: false }, jumpEventId };
};

const shortcutKeyLabel = (attempt: BlockedPointerAttempt): string => {
  if (attempt.shortcutKey) {
    return typeof attempt.shortcutKey === "string"
      ? attempt.shortcutKey
      : attempt.shortcutKey.join("+");
  }
  if (attempt.actionId === "grid.timed") return attempt.gridTimeKey ?? "";
  if (attempt.actionId === "grid.all-day") return "Shift+C";
  return "";
};

/**
 * Teaches the keyboard on every click without blocking the click. A click on
 * a dead target (event card, empty grid slot, annotated chrome) shows the
 * exact keyboard path and arms it: the clicked event is focused so its jump
 * letter plus Enter opens it, and a clicked grid slot becomes the target for
 * typed time digits. A click on a working control that carries a shortcut
 * performs the action and shows the key for next time. Text selection and
 * copy buttons are untouched. Mounted once in RootShell for calendar views.
 */
export function usePointerHintTracker(enabled = true) {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!enabledRef.current) return;
      if (event.button !== PRIMARY_BUTTON || event.pointerType === "touch") {
        return;
      }

      const teaching = resolveTeaching(event);
      if (!teaching) return;
      const { attempt, gridIntent, jumpEventId } = teaching;

      if (!readPointerHintDismissedPermanently()) {
        pointerHintActions.pulse(attempt);
        track("pointer_hint_shown", {
          action_id: attempt.actionId,
          shortcut_key: shortcutKeyLabel(attempt),
          performed: attempt.performed === true,
          view: viewFromPathname(window.location.pathname),
        });
      }

      // The taught path must work immediately, tips on or off.
      if (gridIntent) {
        eventJumpActions.setActive(false);
        requestPointerGridCreate(gridIntent);
        return;
      }
      if (jumpEventId) {
        // Never let a prior event's assignment flash for a new/locked target.
        eventJumpActions.setPointerHint(null);
        requestPointerEventJump(jumpEventId);
        return;
      }
      // Jump mode swallows unmatched printable keys, including `]`.
      eventJumpActions.setActive(false);
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, []);
}
