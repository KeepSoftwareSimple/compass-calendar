import { type Event } from "@core/types/event.contracts";

type DetailsContent = Extract<Event["content"], { kind: "details" }>;

/** Location string used in editable content and undo snapshots. */
export function detailsLocationForUndo(
  content: Pick<DetailsContent, "location">,
): string {
  return content.location ?? "";
}

/**
 * Whether two detail payloads match for undo/redo staleness checks.
 * Ignores provider-owned colorHex when a Compass color slot is set, and
 * treats a missing color key like explicit null.
 */
export function eventDetailsEqualForUndo(
  left: Event["content"],
  right: Event["content"],
): boolean {
  if (left.kind !== "details" || right.kind !== "details") {
    return left.kind === right.kind;
  }
  if (left.title !== right.title || left.description !== right.description) {
    return false;
  }
  if (detailsLocationForUndo(left) !== detailsLocationForUndo(right)) {
    return false;
  }
  const leftColor = left.color ?? null;
  const rightColor = right.color ?? null;
  if (leftColor !== rightColor) return false;
  if (leftColor !== null) return true;
  return (left.colorHex ?? null) === (right.colorHex ?? null);
}
