import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { type Event } from "@core/types/event.contracts";
import { type Dayjs } from "@core/util/date/dayjs";
import { copyText } from "@web/common/utils/clipboard/clipboard.util";
import { formatEventClipboardText } from "@web/events/event-clipboard-text.util";
import { eventStartDay } from "@web/events/mutations/event-on-target-day";
import { isEventFormOpen, useDraftStore } from "@web/events/stores/draft.store";
import {
  eventPastePreviewActions,
  useEventPastePreviewStore,
} from "@web/events/stores/event-paste-preview.store";
import {
  eventJumpActions,
  isEventJumpActive,
} from "@web/shortcuts/shift-hint/event-jump.store";

export function beginEventPastePreview(
  sourceEvent: Event,
  targetDay: Dayjs,
): void {
  if (isEventFormOpen() || useDraftStore.getState().gridDraft) return;

  const targetKey = targetDay.format(YEAR_MONTH_DAY_FORMAT);
  const ownsEventJump = !isEventJumpActive();
  eventPastePreviewActions.activate(ownsEventJump);

  if (ownsEventJump) {
    eventJumpActions.setActive(true);
  }
  eventJumpActions.setActiveDayKeys(
    [targetKey],
    "Copied. Choose where to paste.",
  );
  void copyText(formatEventClipboardText(sourceEvent));
}

export function endEventPastePreview(): void {
  const { isActive, ownsEventJump } = useEventPastePreviewStore.getState();
  if (!isActive) return;

  eventPastePreviewActions.deactivate();
  if (ownsEventJump && isEventJumpActive()) {
    eventJumpActions.setActive(false);
  }
  eventJumpActions.setPointerDraftIntent(null);
}

export function pastePreviewTargetDay(
  sourceEvent: Event,
  resolveTargetDay: (sourceDay: Dayjs) => Dayjs,
): Dayjs {
  const sourceDay = eventStartDay(sourceEvent);
  return resolveTargetDay(sourceDay).startOf("day");
}
