import { Origin } from "@core/constants/core.constants";
import { YEAR_MONTH_DAY_COMPACT_FORMAT } from "@core/constants/date.constants";
import { Status } from "@core/errors/status.codes";
import {
  type BaseEvent,
  type CompassEvent,
} from "@core/types/compass-event.contracts";
import {
  type EventMutationError,
  EventMutationErrorSchema,
} from "@core/types/event-command.contracts";
import { type WithId } from "@core/types/type.utils";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { type ApiError } from "@web/api/api.types";
import { getErrorStatus, isSessionLevelError } from "@web/api/util/api.util";
import { isBackendUnavailableError } from "@web/api/util/backend-unavailable-error.util";
import { getUserId } from "@web/auth/compass/session/session.util";
import { getPosthogClient } from "@web/auth/posthog/posthog.bootstrap";
import {
  EVENT_SAVE_UNAVAILABLE_TOAST_ID,
  GENERIC_ERROR_TOAST_ID,
} from "@web/common/constants/toast.constants";
import {
  Categories_Event,
  type GridEvent,
  type WebEvent,
} from "@web/common/types/web.event.types";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import {
  calendarEventIdValueSelector,
  readCalendarEventIdFromElement,
} from "@web/grid/interaction/view-event-registry";

export const gridEventDefaultPosition: GridEvent["position"] = {
  isOverlapping: false,
  totalEventsInGroup: 1,
  widthMultiplier: 1,
  horizontalOrder: 1,
  initialX: null,
  initialY: null,
  dragOffset: { x: 0, y: 0 },
};

export const addId = (event: GridEvent): WithId<GridEvent> => {
  const _event = {
    ...event,
    _id: createObjectIdString(),
  } as WithId<GridEvent>;

  return _event;
};

export type EventWithDates = CompassEvent & {
  startDate: string;
  endDate: string;
};

const assembleWebEvent = (event: EventWithDates): WebEvent => ({
  ...event,
  startDate: event.startDate,
  endDate: event.endDate,
  origin: event.origin ?? Origin.COMPASS,
  user: event.user ?? "",
  recurrence: event.recurrence as WebEvent["recurrence"],
});

export const assembleDefaultEvent = async (
  draftType?: Categories_Event | null,
  startDate?: string,
  endDate?: string,
): Promise<CompassEvent | GridEvent> => {
  const userId = await getUserId();
  const baseEvent = _assembleBaseEvent(userId, {});

  switch (draftType) {
    case Categories_Event.ALLDAY: {
      const defaultAllday: CompassEvent = {
        ...baseEvent,
        isAllDay: true,
        startDate,
        endDate: endDate ?? startDate,
      };
      return defaultAllday;
    }
    case Categories_Event.TIMED: {
      const defaultTimed: GridEvent = {
        ...baseEvent,
        _id: baseEvent._id!,
        isAllDay: false,
        startDate: startDate!,
        endDate: endDate!,
        position: gridEventDefaultPosition,
        origin: baseEvent.origin ?? Origin.COMPASS,
        user: baseEvent.user!,
        recurrence: baseEvent.recurrence as BaseEvent["recurrence"],
      };
      return defaultTimed;
    }
    default:
      return baseEvent;
  }
};

export const assembleGridEvent = (event: EventWithDates): GridEvent => {
  const gridEvent: GridEvent = {
    ...assembleWebEvent(event),
    position: gridEventDefaultPosition,
    _id: event._id!,
  };

  return gridEvent;
};

export const getCalendarEventIdFromElement = (element: HTMLElement) =>
  readCalendarEventIdFromElement(element);

/**
 * How many frames a focus retry waits for its target. Roughly half a second
 * at 60fps: long enough for React to commit a remount, short enough that a
 * card which never arrives stops spinning.
 */
const FOCUS_RETRY_FRAMES = 30;

/**
 * Focuses the element `findTarget` returns, retrying once per animation frame
 * until it appears or the budget runs out. `startOnNextFrame` defers the first
 * look by a frame, for callers that must let a pending unmount commit first.
 */
const focusAcrossFrames = (
  findTarget: () => HTMLElement | null | undefined,
  { startOnNextFrame = false }: { startOnNextFrame?: boolean } = {},
) => {
  let attemptsLeft = FOCUS_RETRY_FRAMES;

  const tryFocus = () => {
    const element = findTarget();
    if (element) {
      element.focus();
      return;
    }
    attemptsLeft -= 1;
    if (attemptsLeft > 0) requestAnimationFrame(tryFocus);
  };

  if (startOnNextFrame) {
    requestAnimationFrame(tryFocus);
    return;
  }
  tryFocus();
};

/**
 * Focuses a calendar event's DOM node as soon as it exists. Retries across
 * animation frames when the card is not mounted yet (e.g. after form close or
 * undo restore). Unlike `refocusEventElement`, this focuses an in-place node
 * and does not wait for React to replace it.
 */
export const focusCalendarEventElement = (eventId: string) => {
  const selector = calendarEventIdValueSelector(eventId);
  focusAcrossFrames(() => document.querySelector<HTMLElement>(selector));
};

const isGridDraftEventSurface = (element: HTMLElement) =>
  element.getAttribute("data-grid-event-surface") === "draft";

/**
 * Focuses the grid event after the form draft is discarded. Skips `GridDraft`
 * portal nodes (same interaction id, unmounts on the next commit) and retries
 * across animation frames until a saved/placeholder card is available.
 */
export const focusCalendarEventElementAfterDiscard = (eventId: string) => {
  const selector = calendarEventIdValueSelector(eventId);
  focusAcrossFrames(
    () =>
      [...document.querySelectorAll<HTMLElement>(selector)].find(
        (candidate) => !isGridDraftEventSurface(candidate),
      ),
    { startOnNextFrame: true },
  );
};

/**
 * Refocuses an event's element after React replaces it. Retries across
 * animation frames until the new element appears, then focuses it.
 */
export const refocusEventElement = (eventId: string) => {
  const selector = calendarEventIdValueSelector(eventId);
  const staleElement = document.querySelector(selector);
  focusAcrossFrames(() => {
    const element = document.querySelector<HTMLElement>(selector);
    return element && element !== staleElement ? element : null;
  });
};

export const getWeekDayLabel = (day: Dayjs | Date) => {
  if (day instanceof Date) {
    return dayjs(day).format(YEAR_MONTH_DAY_COMPACT_FORMAT);
  }
  return day.format(YEAR_MONTH_DAY_COMPACT_FORMAT);
};

/**
 * A known mutation failure authored by the backend. These have user-facing
 * feedback already, so they must not create error-tracking issues.
 */
const parseExpectedMutationError = (error: Error) => {
  const parsed = EventMutationErrorSchema.safeParse(
    (error as ApiError).response?.data,
  );
  return parsed.success ? parsed.data : null;
};

const CATCHALL_TOAST_MESSAGE =
  "Something went wrong behind the scenes. Please try again later.";

// Curated copy for backend-authored mutation failures the user can act on.
// Codes without an entry fall back to the catch-all — backend messages are
// written for the API contract, not for a toast, so they are never shown
// verbatim. UNSUPPORTED_OPERATION exists because a Google birthday-event
// occurrence delete used to surface as the catch-all with nothing telling
// the user why it would never work.
const MUTATION_ERROR_TOAST_MESSAGES: Partial<
  Record<EventMutationError["code"], string>
> = {
  UNSUPPORTED_OPERATION:
    "This calendar doesn't allow this change for this event (like birthdays or holidays). Try deleting the entire series, or manage it in your calendar.",
  CALENDAR_READ_ONLY:
    "This calendar is read-only, so its events can't be changed from Compass.",
  RECURRENCE_CONFLICT:
    "This event was changed somewhere else. Refresh to load the latest version, then try again.",
  GOOGLE_REVOKED:
    "Calendar access expired or was revoked. Reconnect your calendar in Compass to resume syncing.",
};

const showCatchallToast = (message: string) =>
  showErrorToast(message, { toastId: GENERIC_ERROR_TOAST_ID });

export const handleError = (error: Error) => {
  if (isBackendUnavailableError(error)) {
    // No HTTP response reached us at all (offline, DNS, dropped connection)
    // or a 502/503/504 - the optimistic edit is about to roll back with
    // nothing else on screen to explain why.
    showErrorToast(
      "Couldn't save - check your connection. Your change was not applied.",
      { toastId: EVENT_SAVE_UNAVAILABLE_TOAST_ID },
    );
    return;
  }

  // Prefer the structured status on ApiError; fall back to the trailing
  // status digits in the message for errors that only carry text.
  const code = getErrorStatus(error) ?? Number.NaN;

  // Session recovery already owns the toast — do not stack a second message.
  if (isSessionLevelError(error)) {
    return;
  }
  // NOT_FOUND is not a session failure (e.g. syncing onto a calendar the
  // server hasn't provisioned yet) — the interceptor only console.error's it
  // and rethrows. Left unhandled here, the optimistic edit silently rolls
  // back with no visible feedback at all.
  if (code === Status.NOT_FOUND) {
    showCatchallToast(CATCHALL_TOAST_MESSAGE);
    return;
  }

  const mutationError = parseExpectedMutationError(error);
  if (mutationError) {
    // Look-around writes are refused on purpose: the billing gate is the
    // feedback. A catch-all toast on top of it reads as an unexpected crash.
    if (mutationError.code === "BILLING_REQUIRED") {
      return;
    }
    // The backend authored a known mutation failure: tell the user what
    // actually happened when we have copy for it (a generic toast on a
    // deterministic refusal reads as "try again", which can never work).
    // No error-tracking capture either way — these are expected outcomes.
    showCatchallToast(
      MUTATION_ERROR_TOAST_MESSAGES[mutationError.code] ??
        CATCHALL_TOAST_MESSAGE,
    );
    return;
  }

  getPosthogClient()?.captureException(error, {
    $exception_handled: true,
    $exception_source: "event-mutation",
    httpStatus: Number.isNaN(code) ? undefined : code,
  });
  console.error(error);

  if (code === Status.INTERNAL_SERVER) {
    showCatchallToast(CATCHALL_TOAST_MESSAGE);
    return;
  }

  showCatchallToast(error.message);
};

export const isEventInRange = (
  eventDate: { start: string; end: string },
  rangeDate: { start: string; end: string },
) => {
  const isStartDateInRange = dayjs(eventDate.start).isBetween(
    rangeDate.start,
    rangeDate.end,
    "day",
    "[]",
  );
  const isEndDateInRange = dayjs(eventDate.end).isBetween(
    rangeDate.start,
    rangeDate.end,
    "day",
    "[]",
  );

  return isStartDateInRange || isEndDateInRange;
};

const _assembleBaseEvent = (
  userId: string,
  event: Partial<CompassEvent>,
): CompassEvent => {
  const baseEvent = {
    _id: event._id,
    title: event.title ?? "",
    description: event.description ?? "",
    startDate: event.startDate,
    endDate: event.endDate,
    user: userId,
    isAllDay: event.isAllDay ?? false,
    origin: event.origin ?? Origin.COMPASS,
  };

  return baseEvent;
};
