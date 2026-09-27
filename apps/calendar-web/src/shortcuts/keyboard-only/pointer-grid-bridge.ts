/** Event-jump and grid-create requests shared by shift-hold hints and the palette. */

export const POINTER_EVENT_JUMP_REQUEST = "compass:pointer-event-jump";
export const POINTER_GRID_CREATE_REQUEST = "compass:pointer-grid-create";

export type PointerGridIntent = {
  date: string;
  kind: "all-day" | "timed";
  /** Exact effective-zone instant selected by the pointer. */
  start?: string;
  timeKey?: string;
  timeLabel?: string;
};

export const requestPointerEventJump = (eventId: string) => {
  document.dispatchEvent(
    new CustomEvent(POINTER_EVENT_JUMP_REQUEST, { detail: { eventId } }),
  );
};

export const pointerGridIntent = (event: Event): PointerGridIntent | null => {
  if (!(event instanceof CustomEvent)) return null;
  const detail = event.detail;
  if (
    !detail ||
    typeof detail.date !== "string" ||
    (detail.kind !== "all-day" && detail.kind !== "timed")
  ) {
    return null;
  }
  return {
    date: detail.date,
    kind: detail.kind,
    ...(typeof detail.timeKey === "string" ? { timeKey: detail.timeKey } : {}),
    ...(typeof detail.start === "string" ? { start: detail.start } : {}),
    ...(typeof detail.timeLabel === "string"
      ? { timeLabel: detail.timeLabel }
      : {}),
  };
};

export const pointerEventJumpId = (event: Event): string | undefined => {
  if (!(event instanceof CustomEvent)) return undefined;
  const eventId = event.detail?.eventId;
  return typeof eventId === "string" && eventId.length > 0
    ? eventId
    : undefined;
};
