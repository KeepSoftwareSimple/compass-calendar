import { type GridEvent } from "@web/common/types/web.event.types";
import { refocusEventElement } from "@web/common/utils/event/event.util";
import {
  type EventEdge,
  type EventNudgeMovement,
  getArrowKeyMovement,
  nudgeEventDates,
  nudgeEventEdgeDates,
  nudgeStepFromKeyboard,
} from "@web/common/utils/event/event-nudge.util";

function keyboardNudgeMovement(
  event: GridEvent,
  keyboardEvent: KeyboardEvent,
): { eventId: string; movement: EventNudgeMovement } | null {
  if (!event._id) return null;

  const movement = getArrowKeyMovement(
    keyboardEvent.key,
    Boolean(event.isAllDay),
    nudgeStepFromKeyboard(keyboardEvent),
  );
  if (!movement) return null;

  return { eventId: event._id, movement };
}

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
  const prepared = keyboardNudgeMovement(event, keyboardEvent);
  if (!prepared) return false;

  const dates = nudgeEventDates(event, prepared.movement);
  if (!dates) return false;

  keyboardEvent.preventDefault();
  onNudge({ ...event, ...dates });
  afterNudge?.();
  refocusEventElement(prepared.eventId);
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
  const prepared = keyboardNudgeMovement(event, keyboardEvent);
  if (!prepared) return false;

  const result = nudgeEventEdgeDates(event, edge, prepared.movement);
  if (!result) return false;

  keyboardEvent.preventDefault();
  onNudge(
    { ...event, startDate: result.startDate, endDate: result.endDate },
    result.edge,
  );
  afterNudge?.();
  refocusEventElement(prepared.eventId);
  return true;
}
