import { type CaptureResult } from "posthog-js";

/**
 * Metrics whose zero value is impossible rather than merely excellent.
 *
 * LCP, FCP and INP all measure "how long until X happened". Zero means X was
 * never timed, not that it happened instantly - a paint cannot land in the same
 * millisecond the navigation started, and an interaction cannot take no time at
 * all. CLS is deliberately absent: a page that never shifts really does score 0,
 * and that is the score we want to keep.
 */
const NON_ZERO_METRICS = ["LCP", "FCP", "INP"] as const;

/**
 * posthog-js only rejects a metric whose value is null or undefined
 * (`isNullish(metric?.value)` in its web-vitals extension), so a zero sails
 * through into `$web_vitals_<name>_value`. One such LCP = 0 landed on
 * 2026-08-26. A zero is not a fast page, it is the absence of a measurement,
 * and left in place it drags every average toward zero exactly when the sample
 * count is too small to absorb it.
 *
 * A single `$web_vitals` event carries whichever metrics happened to be in
 * posthog's flush buffer, so this strips only the bogus metric's own properties
 * and keeps the rest of the event. The event is dropped entirely only when
 * nothing measurable is left.
 */
export function filterPosthogWebVitals(
  event: CaptureResult | null,
): CaptureResult | null {
  if (event?.event !== "$web_vitals") return event;

  const properties = event.properties;
  if (!properties) return event;

  let droppedAny = false;
  for (const metric of NON_ZERO_METRICS) {
    if (properties[`$web_vitals_${metric}_value`] === 0) {
      delete properties[`$web_vitals_${metric}_value`];
      delete properties[`$web_vitals_${metric}_event`];
      droppedAny = true;
    }
  }
  if (!droppedAny) return event;

  // Every metric in the batch was bogus; there is nothing left to report.
  const hasRemainingMetric = Object.keys(properties).some(
    (key) => key.startsWith("$web_vitals_") && key.endsWith("_value"),
  );
  return hasRemainingMetric ? event : null;
}
