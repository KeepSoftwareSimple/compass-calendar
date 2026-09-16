import { type FC, useMemo } from "react";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { type GridEvent as GridEventEntity } from "@web/common/types/web.event.types";
import { focusEventFormTitle } from "@web/common/utils/form/form.util";
import { type GridEventDraft } from "@web/events/event-draft.types";
import { gridEventDraftToGridEvent } from "@web/events/grid-event-draft.adapter";
import { draftActions, isEventFormOpen } from "@web/events/stores/draft.store";
import { GridAllDayEventMemo } from "@web/grid/components/GridAllDayEvent";
import { GridTimedEvent } from "@web/grid/components/GridTimedEvent";
import { getWeekInteractionTargetAttributes } from "@web/grid/interaction/view-event-registry";
import {
  draftToAllDayRowGridEvent,
  isDraftRenderedInAllDayRow,
} from "@web/grid/layout/all-day-draft.position";
import { type TimedDeckLayout } from "@web/grid/layout/timed-deck.layout";
import { type GridVisibleDate } from "@web/grid/types/grid.types";
import { type Measurements_Grid } from "@web/views/Week/hooks/grid/useGridLayout";
import { type WeekProps } from "@web/views/Week/hooks/useWeek";

interface Props {
  activeAllDayDraftEvent?: GridEventEntity | null;
  deckLayout?: TimedDeckLayout | null;
  draft: GridEventDraft;
  measurements: Measurements_Grid;
  recurringPreviews?: readonly GridEventEntity[];
  weekProps: WeekProps;
}

const openDraftFormOrFocusTitle = () => {
  if (!isEventFormOpen()) {
    draftActions.setFormOpen(true);
    return;
  }
  focusEventFormTitle();
};

export const GridDraft: FC<Props> = ({
  activeAllDayDraftEvent = null,
  deckLayout = null,
  draft,
  measurements,
  recurringPreviews = [],
  weekProps,
}) => {
  const draftAsGridEvent = gridEventDraftToGridEvent(draft);
  const visibleDates: GridVisibleDate[] = useMemo(
    () =>
      weekProps.component.weekDays.map((date) => ({
        date,
        key: date.format(YEAR_MONTH_DAY_FORMAT),
      })),
    [weekProps.component.weekDays],
  );
  const rendersInAllDayRow = isDraftRenderedInAllDayRow(draft);
  const allDayDraftEvent = rendersInAllDayRow
    ? (activeAllDayDraftEvent ?? draftToAllDayRowGridEvent(draft))
    : draftAsGridEvent;
  const draftEventType = rendersInAllDayRow ? "all-day" : "timed";
  const draftInteractionAttributes = draftAsGridEvent._id
    ? {
        ...getWeekInteractionTargetAttributes({
          eventId: draftAsGridEvent._id,
          eventType: draftEventType,
        }),
        "data-grid-event-surface": "draft",
      }
    : undefined;

  return (
    <>
      {recurringPreviews.map((preview) => (
        <GridTimedEvent
          displayMode="draft"
          event={preview}
          interactionAttributes={
            preview._id
              ? getWeekInteractionTargetAttributes({
                  eventId: preview._id,
                  eventType: "timed",
                })
              : undefined
          }
          key={`draft-preview-${preview.startDate}`}
          measurements={measurements}
          visibleDates={visibleDates}
        />
      ))}

      {rendersInAllDayRow ? (
        <GridAllDayEventMemo
          event={allDayDraftEvent}
          interactionAttributes={draftInteractionAttributes}
          isPlaceholder={false}
          key={`draft-${draftAsGridEvent._id}`}
          measurements={measurements}
          onEventKeyDown={openDraftFormOrFocusTitle}
          visibleDates={visibleDates}
        />
      ) : (
        <GridTimedEvent
          deckLayout={deckLayout}
          displayMode="draft"
          event={draftAsGridEvent}
          interactionAttributes={draftInteractionAttributes}
          key={`draft-${draftAsGridEvent._id}`}
          measurements={measurements}
          onEventKeyDown={openDraftFormOrFocusTitle}
          visibleDates={visibleDates}
        />
      )}
    </>
  );
};
