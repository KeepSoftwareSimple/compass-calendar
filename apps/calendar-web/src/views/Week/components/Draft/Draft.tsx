import { type FC, useMemo } from "react";
import { createPortal } from "react-dom";
import { type GridEvent } from "@web/common/types/web.event.types";
import { getDraftContainer } from "@web/common/utils/draft/draft.util";
import { gridEventDraftToGridEvent } from "@web/events/grid-event-draft.adapter";
import { useWeekEventViewModel } from "@web/events/queries/useWeekEventsQuery";
import { selectGridDraft, useDraftStore } from "@web/events/stores/draft.store";
import { positionAllDayDraftEvent } from "@web/grid/layout/all-day-draft.position";
import { type Measurements_Grid } from "@web/views/Week/hooks/grid/useGridLayout";
import { type WeekProps } from "@web/views/Week/hooks/useWeek";
import { getActiveTimedDraftDeckLayout } from "./grid/activeTimedDraftDeckLayout";
import { GridDraft } from "./grid/GridDraft";
import { getRecurringDraftPreviews } from "./grid/getRecurringDraftPreviews";

interface Props {
  measurements: Measurements_Grid;
  weekProps: WeekProps;
}

export const Draft: FC<Props> = ({ measurements, weekProps }) => {
  const { allDayEvents, timedEvents } = useWeekEventViewModel({
    startOfView: weekProps.query.startOfView,
    endOfView: weekProps.query.endOfView,
  });
  const draft = useDraftStore(selectGridDraft);

  const draftGridEvent: GridEvent | null = useMemo(
    () => (draft ? gridEventDraftToGridEvent(draft) : null),
    [draft],
  );
  const activeAllDayDraftEvent = useMemo(
    () =>
      positionAllDayDraftEvent({
        draft,
        events: allDayEvents,
      }).activeDraftEvent,
    [allDayEvents, draft],
  );
  const deckLayout = useMemo(
    () =>
      getActiveTimedDraftDeckLayout(draftGridEvent, [
        ...timedEvents,
        ...allDayEvents,
      ]),
    [allDayEvents, draftGridEvent, timedEvents],
  );
  const recurringPreviews = useMemo(
    () =>
      getRecurringDraftPreviews(
        draftGridEvent,
        weekProps.component.startOfView,
        weekProps.component.endOfView,
      ),
    [
      draftGridEvent,
      weekProps.component.startOfView,
      weekProps.component.endOfView,
    ],
  );

  if (!draft) {
    return null;
  }

  const container = getDraftContainer(draft);
  if (!container) return null;

  return createPortal(
    <GridDraft
      activeAllDayDraftEvent={activeAllDayDraftEvent}
      deckLayout={deckLayout}
      draft={draft}
      measurements={measurements}
      recurringPreviews={recurringPreviews}
      weekProps={weekProps}
    />,
    container,
  );
};
