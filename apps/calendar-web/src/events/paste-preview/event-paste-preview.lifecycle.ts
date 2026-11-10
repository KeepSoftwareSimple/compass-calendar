import { type Calendar } from "@core/types/calendar.contracts";
import { type Event } from "@core/types/event.contracts";
import { copyText } from "@web/common/utils/clipboard/clipboard.util";
import { focusCalendarEventElement } from "@web/common/utils/event/event.util";
import { formatEventClipboardText } from "@web/events/event-clipboard-text.util";
import { getGridDraftId } from "@web/events/grid-event-draft.adapter";
import { duplicateDraftForPastePlacement } from "@web/events/paste-preview/paste-placement.util";
import {
  draftActions,
  isEventFormOpen,
  useDraftStore,
} from "@web/events/stores/draft.store";
import {
  eventPastePreviewActions,
  useEventPastePreviewStore,
} from "@web/events/stores/event-paste-preview.store";

export function beginEventPastePreview(
  sourceEvent: Event,
  calendars: Calendar[],
): void {
  if (isEventFormOpen()) return;

  const { gridDraft, status } = useDraftStore.getState();
  if (gridDraft && status?.activity !== "pastePlace") return;
  if (status?.activity === "pastePlace") {
    draftActions.discard();
    eventPastePreviewActions.deactivate();
  }

  const placement = duplicateDraftForPastePlacement(sourceEvent, calendars);
  if (!placement) return;

  eventPastePreviewActions.activate();
  draftActions.startGridDraft({ activity: "pastePlace", draft: placement });
  void copyText(formatEventClipboardText(sourceEvent));
  const draftId = getGridDraftId(placement);
  if (draftId) focusCalendarEventElement(draftId);
}

export function endEventPastePreview(): void {
  const { isActive } = useEventPastePreviewStore.getState();
  if (!isActive) return;

  const { status } = useDraftStore.getState();
  if (status?.activity === "pastePlace") {
    draftActions.discard();
  }
  eventPastePreviewActions.deactivate();
}
