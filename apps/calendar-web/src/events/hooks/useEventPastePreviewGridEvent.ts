import { useMemo } from "react";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { EventIdSchema } from "@core/types/domain-primitives";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { useCalendarsQuery } from "@web/calendars/calendar.query";
import { type GridEvent } from "@web/common/types/web.event.types";
import {
  duplicateGridEventDraft,
  gridEventDraftToGridEvent,
} from "@web/events/grid-event-draft.adapter";
import { eventOnTargetDay } from "@web/events/mutations/event-on-target-day";
import { useEventClipboardStore } from "@web/events/stores/event-clipboard.store";
import {
  selectEventPastePreviewActive,
  useEventPastePreviewStore,
} from "@web/events/stores/event-paste-preview.store";
import {
  draftToAllDayRowGridEvent,
  isDraftRenderedInAllDayRow,
} from "@web/grid/layout/all-day-draft.position";
import { quickTimeFocusedColumnDay } from "@web/shortcuts/quick-time/quick-time.util";
import {
  selectEventJumpActiveDayKeys,
  selectPointerDraftDateKey,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";

export const EVENT_PASTE_PREVIEW_ID = EventIdSchema.parse(
  "aaaaaaaaaaaaaaaaaaaaaaae",
);

const previewTargetDay = (
  activeDayKeys: string[],
  pointerDraftDateKey: string | null,
  fallbackDay: Dayjs,
): Dayjs => {
  const focusedColumn = quickTimeFocusedColumnDay(
    pointerDraftDateKey,
    activeDayKeys,
  );
  if (focusedColumn) return focusedColumn.startOf("day");
  if (activeDayKeys.length === 1) {
    return dayjs(activeDayKeys[0], YEAR_MONTH_DAY_FORMAT).startOf("day");
  }
  return fallbackDay.startOf("day");
};

/** Ghost grid card shown while an event is copied and the user is choosing a paste target. */
export function useEventPastePreviewGridEvent(
  fallbackDay: Dayjs,
): GridEvent | null {
  const isActive = useEventPastePreviewStore(selectEventPastePreviewActive);
  const source = useEventClipboardStore((state) => state.event);
  const activeDayKeys = useEventJumpStore(selectEventJumpActiveDayKeys);
  const pointerDraftDateKey = useEventJumpStore(selectPointerDraftDateKey);
  const { data: calendars } = useCalendarsQuery();

  return useMemo(() => {
    if (!isActive || !source) return null;

    const targetDay = previewTargetDay(
      activeDayKeys,
      pointerDraftDateKey,
      fallbackDay,
    );
    const adjusted = eventOnTargetDay(source, targetDay);
    const draft = duplicateGridEventDraft(adjusted, calendars ?? []);
    if (!draft) return null;

    const withId = { ...draft, clientId: EVENT_PASTE_PREVIEW_ID };
    if (isDraftRenderedInAllDayRow(withId)) {
      return draftToAllDayRowGridEvent(withId);
    }

    return gridEventDraftToGridEvent(withId);
  }, [
    activeDayKeys,
    calendars,
    fallbackDay,
    isActive,
    pointerDraftDateKey,
    source,
  ]);
}
