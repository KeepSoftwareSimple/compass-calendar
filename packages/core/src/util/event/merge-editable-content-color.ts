import { type EventColorSlot } from "@core/types/event-color.contracts";

export type EditableContentColorFields = {
  readonly color?: EventColorSlot | null;
  readonly colorHex?: string;
};

/**
 * Mirrors sync `mergeUpdateContent` color semantics for optimistic UI merges.
 * Null color clears an existing slot; on hex-only events it preserves colorHex.
 * A defined slot replaces and drops colorHex.
 */
export function mergeEditableContentColor<T extends EditableContentColorFields>(
  existing: EditableContentColorFields,
  incoming: EditableContentColorFields,
  merged: T,
): T & EditableContentColorFields {
  const existingColor = existing.color;
  const existingColorHex = existing.colorHex;

  if (incoming.color === null) {
    if (existingColor !== undefined) return merged;
    return existingColorHex !== undefined
      ? { ...merged, colorHex: existingColorHex }
      : merged;
  }
  if (incoming.color !== undefined) {
    return { ...merged, color: incoming.color };
  }

  let kept = merged as T & EditableContentColorFields;
  if (existingColor !== undefined) kept = { ...kept, color: existingColor };
  if (existingColorHex !== undefined) {
    kept = { ...kept, colorHex: existingColorHex };
  }
  return kept;
}
