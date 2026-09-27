import { useLocation, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import dayjs from "@core/util/date/dayjs";
import { ROUTE_IDS } from "@web/common/constants/routes";
import { useUpNextEvent } from "@web/components/Sidebar/UpNextCard/useUpNextEvent";
import { useViewStore } from "@web/events/stores/view.store";
import {
  DEFAULT_DOCUMENT_TITLE,
  formatDocumentTitle,
  formatViewTitleLabel,
} from "./formatDocumentTitle";

/**
 * Sets `document.title` from Up Next (when present) or the current view date.
 * Mount once under the authenticated root so it shares the same Up Next query
 * cache as the banner/card (React Query dedupes; each mount still has its own
 * minute tick via useUpNextEvent).
 */
export function useDocumentTitle() {
  const { now, upNext, isCurrentEvent } = useUpNextEvent();
  const { pathname } = useLocation();
  const dayParams = useParams({
    from: ROUTE_IDS.DAY_DATE,
    shouldThrow: false,
  });
  const weekDates = useViewStore((state) => state.dates);

  const viewLabel = formatViewTitleLabel({
    pathname,
    dayDateString: dayParams?.dateString,
    weekStart: weekDates.start,
    weekEnd: weekDates.end,
  });

  const title = formatDocumentTitle({
    now,
    event: upNext
      ? {
          title: upNext.title ?? "",
          start: dayjs(upNext.startDate),
          end: dayjs(upNext.endDate),
        }
      : null,
    isCurrentEvent,
    viewLabel,
  });

  useEffect(() => {
    document.title = title;
    return () => {
      document.title = DEFAULT_DOCUMENT_TITLE;
    };
  }, [title]);
}
