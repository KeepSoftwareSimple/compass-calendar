import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { ROOT_ROUTES } from "@web/common/constants/routes";

export const DOCUMENT_TITLE_BRAND = "Compass";
export const DEFAULT_DOCUMENT_TITLE = "Compass Calendar";

const DATE_FORMAT = dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT;

export type DocumentTitleEvent = {
  title: string;
  start: Dayjs;
  end: Dayjs;
};

export type FormatDocumentTitleArgs = {
  now: Dayjs;
  event: DocumentTitleEvent | null;
  isCurrentEvent: boolean;
  viewLabel: string;
};

/** Compact tab title. Lead with the useful part; tabs truncate early. */
export function formatDocumentTitle({
  now,
  event,
  isCurrentEvent,
  viewLabel,
}: FormatDocumentTitleArgs): string {
  if (event) {
    const eventTitle = event.title.trim() || "Event";
    if (isCurrentEvent) {
      return `Now: ${eventTitle} - ${DOCUMENT_TITLE_BRAND}`;
    }

    const minutes = Math.round(event.start.diff(now, "minute", true));
    if (minutes <= 0) {
      return `Now: ${eventTitle} - ${DOCUMENT_TITLE_BRAND}`;
    }
    if (minutes < 60) {
      return `In ${minutes}m: ${eventTitle} - ${DOCUMENT_TITLE_BRAND}`;
    }
    const hours = Math.round(minutes / 60);
    return `In ${hours}h: ${eventTitle} - ${DOCUMENT_TITLE_BRAND}`;
  }

  return `${viewLabel} - ${DOCUMENT_TITLE_BRAND}`;
}

export type FormatViewTitleLabelArgs = {
  pathname: string;
  dayDateString?: string;
  weekStart: string;
  weekEnd: string;
};

/** Idle tab label for the current Day / Week / Life context (no brand suffix). */
export function formatViewTitleLabel({
  pathname,
  dayDateString,
  weekStart,
  weekEnd,
}: FormatViewTitleLabelArgs): string {
  if (
    pathname === ROOT_ROUTES.LIFE ||
    pathname.startsWith(`${ROOT_ROUTES.LIFE}/`)
  ) {
    return "Life";
  }

  if (
    pathname === ROOT_ROUTES.DAY ||
    pathname.startsWith(`${ROOT_ROUTES.DAY}/`)
  ) {
    const date = dayDateString ? dayjs(dayDateString, DATE_FORMAT) : dayjs();
    return date.format("ddd MMM D");
  }

  const start = dayjs(weekStart);
  const end = dayjs(weekEnd);
  if (start.isSame(end, "day")) {
    return start.format("ddd MMM D");
  }
  const endFormat = start.month() === end.month() ? "D" : "MMM D";
  return `${start.format("MMM D")} - ${end.format(endFormat)}`;
}
