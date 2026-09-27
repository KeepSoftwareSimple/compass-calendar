export function pressKey(
  key: string,
  {
    keyUpInit = {},
    keyDownInit = {},
  }: { keyUpInit?: KeyboardEventInit; keyDownInit?: KeyboardEventInit } = {},
  target: Element | Node | Window | Document = document,
) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      ...keyDownInit,
      key,
    }),
  );

  target.dispatchEvent(
    new KeyboardEvent("keyup", {
      bubbles: true,
      cancelable: true,
      composed: true,
      ...keyUpInit,
      key,
    }),
  );
}

/** Some browsers fire KeyboardEvents with `key` unset. */
export function dispatchMissingKey(
  type: "keydown" | "keyup",
  target: Element | Node | Window | Document = document,
) {
  const event = new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  Object.defineProperty(event, "key", { get: () => undefined });
  target.dispatchEvent(event);
  return event;
}
