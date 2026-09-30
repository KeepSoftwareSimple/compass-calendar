import { pointerIntentActions } from "@web/views/Week/pointer-intent/pointer-intent.actions";

export const HOVER_HUNT_SAMPLE_MS = 100;
export const HOVER_HUNT_WINDOW_MS = 4_000;
export const HOVER_HUNT_MIN_TARGETS = 3;

const INTERACTIVE_SELECTOR =
  "button, [role=button], a[href], [tabindex]:not([tabindex='-1'])";

type HoverHuntWindow = {
  startedAt: number;
  targets: Set<Element>;
};

/** Capture-phase tracker for pointer wandering across chrome controls. */
export function attachHoverHuntTracker(): () => void {
  let windowState: HoverHuntWindow | null = null;
  let lastSampleAt = 0;

  const resetWindow = () => {
    windowState = null;
  };

  const interactiveTargetAt = (event: PointerEvent): Element | null => {
    if (event.target instanceof Element) {
      const fromTarget = event.target.closest(INTERACTIVE_SELECTOR);
      if (fromTarget) return fromTarget;
    }
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    return hit?.closest(INTERACTIVE_SELECTOR) ?? null;
  };

  const maybeEmitHoverHunt = (now: number) => {
    if (!windowState) return;
    if (now - windowState.startedAt > HOVER_HUNT_WINDOW_MS) {
      resetWindow();
      return;
    }
    if (windowState.targets.size < HOVER_HUNT_MIN_TARGETS) return;
    resetWindow();
    pointerIntentActions.notify("hover-hunt");
  };

  const onPointerMove = (event: PointerEvent) => {
    const now = Date.now();
    if (now - lastSampleAt < HOVER_HUNT_SAMPLE_MS) return;
    lastSampleAt = now;

    const target = interactiveTargetAt(event);
    if (!target) return;

    if (!windowState || now - windowState.startedAt > HOVER_HUNT_WINDOW_MS) {
      windowState = { startedAt: now, targets: new Set([target]) };
    } else {
      windowState.targets.add(target);
    }

    maybeEmitHoverHunt(now);
  };

  const onPointerDown = () => resetWindow();
  const onKeyDown = () => resetWindow();

  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);

  return () => {
    resetWindow();
    lastSampleAt = 0;
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
  };
}
