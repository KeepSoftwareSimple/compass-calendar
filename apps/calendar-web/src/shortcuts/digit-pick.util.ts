/**
 * Physical top-row keys, left to right, mapped to 0-based option indices.
 * `event.code` is layout-independent (AZERTY's unshifted top row still
 * reports "Digit1"...), so this is the match target; the labels mirror the
 * row order so a rendered chip is self-describing.
 */
const PICK_CODES = [
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "Digit5",
  "Digit6",
  "Digit7",
  "Digit8",
  "Digit9",
  "Digit0",
  "Minus",
  "Equal",
];

export const PICK_KEY_LABELS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "0",
  "-",
  "=",
];

/**
 * Numpad and other codes report a plain digit `key` with no `code` match.
 * Derived from PICK_KEY_LABELS (only the "1".."9","0" entries have a digit
 * `key` at all) so the fallback can't drift from the labels shown on-screen.
 */
const KEY_FALLBACK_INDEX: Record<string, number> = Object.fromEntries(
  PICK_KEY_LABELS.slice(0, 10).map((label, index) => [label, index]),
);

/**
 * Resolves a keydown to a 0-based physical-key index, modifier-agnostic.
 * `event.code` is layout-independent, so this also backs Mod+digit form-field
 * jumps (`useFormDigitJumpShortcut`), not just the bare-digit pickers below.
 */
export function physicalDigitIndex(
  event: Pick<KeyboardEvent, "code" | "key">,
): number | null {
  const codeIndex = PICK_CODES.indexOf(event.code);
  if (codeIndex !== -1) return codeIndex;

  const keyIndex = KEY_FALLBACK_INDEX[event.key];
  return keyIndex === undefined ? null : keyIndex;
}

/**
 * Resolves a keydown to a 0-based pick index for direct-select widgets (the
 * event color picker, calendar select). Returns null for anything else,
 * including Ctrl/Meta/Alt combos (browser tab switching, macOS symbols).
 * Shift is allowed since some layouts require it to type digits.
 */
export function digitPickIndex(
  event: Pick<KeyboardEvent, "code" | "key" | "ctrlKey" | "metaKey" | "altKey">,
): number | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;

  return physicalDigitIndex(event);
}
