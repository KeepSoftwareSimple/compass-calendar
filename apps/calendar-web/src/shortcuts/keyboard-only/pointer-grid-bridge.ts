/** Event-jump requests shared by shift-hold hints, the palette, and pointer intent. */

export const POINTER_EVENT_JUMP_REQUEST = "compass:pointer-event-jump";

export const requestPointerEventJump = (eventId: string) => {
  document.dispatchEvent(
    new CustomEvent(POINTER_EVENT_JUMP_REQUEST, { detail: { eventId } }),
  );
};

export const pointerEventJumpId = (event: Event): string | undefined => {
  if (!(event instanceof CustomEvent)) return undefined;
  const eventId = event.detail?.eventId;
  return typeof eventId === "string" && eventId.length > 0
    ? eventId
    : undefined;
};
