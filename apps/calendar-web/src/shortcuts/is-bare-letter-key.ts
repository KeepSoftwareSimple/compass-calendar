/**
 * Some browsers, extensions, and IME/autofill paths fire KeyboardEvents with
 * `key` unset. Calling `.length` / `.toLowerCase()` on that value is a
 * TypeError and is what production error tracking reports as
 * "Cannot read properties of undefined (reading 'length'|'toLowerCase')".
 */
export const keyboardKey = (event: Pick<KeyboardEvent, "key">): string =>
  typeof event.key === "string" ? event.key : "";

/** Lowercase a single-character key; leave named keys (Escape, ArrowUp) as-is. */
export const normalizedKeyboardKey = (
  event: Pick<KeyboardEvent, "key">,
): string => {
  const key = keyboardKey(event);
  return key.length === 1 ? key.toLowerCase() : key;
};

/** True for an unmodified single-letter key matching `letter` (case-insensitive). */
export const isBareLetterKey = (event: KeyboardEvent, letter: string) => {
  const key = keyboardKey(event);
  return (
    key.length === 1 &&
    key.toLowerCase() === letter &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  );
};
