import { type CaptureResult } from "posthog-js";

/**
 * How long after a click a same-task re-render can still be credited to it.
 *
 * posthog-js stamps a dead-click candidate inside a *bubble-phase* `window`
 * click listener. React reaches its own root listener first, flushes the state
 * update synchronously (clicks are discrete events), and the MutationObserver
 * microtask feeding `_lastMutation` runs before the event finishes bubbling up
 * to `window`. The click's own re-render therefore lands a millisecond or two
 * *before* the timestamp posthog compares it against, `mutation_delay_ms` comes
 * back undefined, and the click is judged dead.
 *
 * A page that keeps mutating afterwards still rescues the click. The onboarding
 * overlays never do: the welcome FAQ and the Shortcut Showcase are static
 * between keystrokes, so whether their buttons look alive is a coin flip on a
 * 1ms clock. Observed on 2026-08-14: 115 of 216 dead clicks reported a last
 * mutation 1-7ms before the click, every one of them alongside the
 * `$autocapture` and product event proving the handler had run.
 *
 * 50ms leaves an order of magnitude of headroom over that cluster while staying
 * far below a genuine dead click, where the page sits untouched for hundreds to
 * tens of thousands of milliseconds.
 */
const SYNC_RENDER_INVERSION_MS = 50;

/** Dead-gesture events; each one prefixes its own diagnostic properties. */
const DEAD_GESTURE_EVENTS = ["$dead_click", "$dead_swipe"] as const;

/**
 * Timestamps arrive as epoch milliseconds from posthog-js, but tolerate the
 * serialized shapes a replayed or rehydrated payload can carry.
 */
const toEpochMs = (value: unknown): number | undefined => {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : undefined;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
};

/**
 * Drop `$dead_click` / `$dead_swipe` events that only look dead because of the
 * timestamp inversion described above: posthog credited the gesture with no
 * mutation at all, yet the last mutation on the page landed in the handful of
 * milliseconds before it — which is the gesture's own synchronous re-render.
 */
export function filterPosthogDeadClick(
  event: CaptureResult | null,
): CaptureResult | null {
  if (!event) return event;

  const prefix = DEAD_GESTURE_EVENTS.find((name) => name === event.event);
  if (!prefix) return event;

  const properties = event.properties;
  if (!properties) return event;

  // posthog omits the delay entirely when it saw no mutation after the gesture;
  // a present value means it measured one and this is not the inversion.
  const mutationDelayMs = properties[`${prefix}_mutation_delay_ms`];
  if (mutationDelayMs !== undefined && mutationDelayMs !== null) return event;

  const gestureAt = toEpochMs(properties[`${prefix}_event_timestamp`]);
  const lastMutationAt = toEpochMs(
    properties[`${prefix}_last_mutation_timestamp`],
  );
  if (gestureAt === undefined || lastMutationAt === undefined) return event;

  const mutationLeadMs = gestureAt - lastMutationAt;
  const isInverted =
    mutationLeadMs >= 0 && mutationLeadMs <= SYNC_RENDER_INVERSION_MS;

  return isInverted ? null : event;
}
