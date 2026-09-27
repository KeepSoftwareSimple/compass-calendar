import { DirtyParser } from "@web/common/utils/parse/dirty.parser";
import { type GridEventDraft } from "@web/events/event-draft.types";

/**
 * Escape should confirm before discarding only when the user is editing a
 * persisted event and the draft differs from that event's pristine edit state.
 * Create drafts and unchanged edits close immediately.
 */
export function shouldConfirmDiscardUnsavedChanges(
  draft: GridEventDraft | null,
): boolean {
  return draft?.kind === "edit" && DirtyParser.isGridDraftDirty(draft);
}
