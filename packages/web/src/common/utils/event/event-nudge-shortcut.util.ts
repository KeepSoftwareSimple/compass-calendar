import { type GridEvent } from "@web/common/types/web.event.types";
import { refocusEventElement } from "@web/common/utils/event/event.util";
import {
  type EventEdge,
  getArrowKeyMovement,
  nudgeEventDates,
  nudgeEventEdgeDates,
  nudgeStepFromKeyboard,
} from "@web/common/utils/event/event-nudge.util";

export function nudgeEventFromKeyboard({
  afterNudge,
  event,
  keyboardEvent,
  onNudge,
}: {
  afterNudge?: () => void;
  event: GridEvent;
  keyboardEvent: KeyboardEvent;
  onNudge: (event: GridEvent) => void;
}): boolean {
  if (!event._id) return false;

  const movement = getArrowKeyMovement(
    keyboardEvent.key,
    Boolean(event.isAllDay),
    nudgeStepFromKeyboard(keyboardEvent),
  );
  if (!movement) return false;

  const dates = nudgeEventDates(event, movement);
  if (!dates) return false;

  keyboardEvent.preventDefault();
  onNudge({ ...event, ...dates });
  afterNudge?.();
  refocusEventElement(event._id);
  return true;
}

export function nudgeEventEdgeFromKeyboard({
  afterNudge,
  edge,
  event,
  keyboardEvent,
  onNudge,
}: {
  afterNudge?: () => void;
  edge: EventEdge;
  event: GridEvent;
  keyboardEvent: KeyboardEvent;
  onNudge: (event: GridEvent, nextEdge: EventEdge) => void;
}): boolean {
  if (!event._id) return false;

  const movement = getArrowKeyMovement(
    keyboardEvent.key,
    Boolean(event.isAllDay),
    nudgeStepFromKeyboard(keyboardEvent),
  );
  if (!movement) return false;

  const result = nudgeEventEdgeDates(event, edge, movement);
  if (!result) return false;

  keyboardEvent.preventDefault();
  onNudge(
    { ...event, startDate: result.startDate, endDate: result.endDate },
    result.edge,
  );
  afterNudge?.();
  refocusEventElement(event._id);
  return true;
}
