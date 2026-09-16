import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { type Event } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { isAppLocked } from "@web/shortcuts/app-lock";
import {
  POINTER_EVENT_ID_ATTRIBUTE,
  requestPointerEventJump,
} from "@web/shortcuts/keyboard-only/pointer-action";
import { type ViewName } from "@web/shortcuts/shortcuts.constants";

const FOCUS_WAIT_MS = 2_000;
const FOCUS_POLL_MS = 50;

export function eventSearchDateString(event: Event): string {
  if (event.schedule.kind === "allDay") {
    return event.schedule.start;
  }
  return dayjs(event.schedule.start)
    .tz(event.schedule.timeZone)
    .format(YEAR_MONTH_DAY_FORMAT);
}

export function eventSearchDetail(event: Event): string {
  if (event.schedule.kind === "allDay") {
    return `${dayjs(event.schedule.start).format("ddd, MMM D")}, All day`;
  }
  return dayjs(event.schedule.start)
    .tz(event.schedule.timeZone)
    .format("ddd, MMM D, h:mm A");
}

const eventCardInDom = (eventId: string): boolean =>
  [...document.querySelectorAll(`[${POINTER_EVENT_ID_ATTRIBUTE}]`)].some(
    (node) => node.getAttribute(POINTER_EVENT_ID_ATTRIBUTE) === eventId,
  );

export function startFocusEventCard(eventId: string): void {
  const deadline = Date.now() + FOCUS_WAIT_MS;
  const tick = () => {
    // The palette holds app-lock until it unmounts. Jumping while locked is
    // a no-op (event-jump stands down), so wait for close before focusing.
    if (isAppLocked() || !eventCardInDom(eventId)) {
      if (Date.now() < deadline) {
        setTimeout(tick, FOCUS_POLL_MS);
      }
      return;
    }
    requestPointerEventJump(eventId);
  };
  tick();
}

export function paletteEventRoute(currentView: ViewName): string {
  return currentView === "day" ? ROOT_ROUTES.DAY_DATE : ROOT_ROUTES.WEEK_DATE;
}
