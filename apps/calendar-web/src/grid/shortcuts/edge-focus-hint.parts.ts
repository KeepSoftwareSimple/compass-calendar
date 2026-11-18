import { KEYMAP } from "@core/shortcuts/keymap";
import { type EventEdge } from "@web/common/utils/event/event-nudge.util";
import { type ShortcutTipPart } from "@web/shortcuts/tips/shortcut-tips.data";

const sep: ShortcutTipPart = " · ";

const MODE_ANNOUNCEMENTS = new Set([
  "Editing start time",
  "Editing end time",
  "Editing whole event",
]);

const wholeEventMoveKeys = (isAllDay: boolean): string[] =>
  isAllDay
    ? ["Shift", "ArrowLeft", "ArrowRight"]
    : ["Shift", "ArrowLeft", "ArrowUp", "ArrowDown", "ArrowRight"];

const edgeMoveKeys = (isAllDay: boolean): string[] =>
  isAllDay
    ? ["Shift", "ArrowLeft", "ArrowRight"]
    : [...KEYMAP.moveEvent.timedEdgeKeycaps];

/** Sidebar education while an event edge or whole-body move focus is active. */
export const edgeFocusHintParts = (
  edge: EventEdge | null,
  isAllDay: boolean,
  announcement: string,
): readonly ShortcutTipPart[] => {
  const movement = movementParts(edge, isAllDay);
  const cycle: readonly ShortcutTipPart[] = [
    { key: KEYMAP.edgeFocus.hotkey },
    " cycles target",
  ];

  if (announcement && !MODE_ANNOUNCEMENTS.has(announcement)) {
    return [announcement, sep, ...movement, sep, ...cycle];
  }

  return [...movement, sep, ...cycle];
};

function movementParts(
  edge: EventEdge | null,
  isAllDay: boolean,
): readonly ShortcutTipPart[] {
  if (edge === null) {
    return [{ keys: wholeEventMoveKeys(isAllDay) }, " moves event"];
  }

  const noun =
    edge === "startDate"
      ? isAllDay
        ? "start date"
        : "start"
      : isAllDay
        ? "end date"
        : "end";

  return [{ keys: edgeMoveKeys(isAllDay) }, ` adjusts ${noun}`];
}
