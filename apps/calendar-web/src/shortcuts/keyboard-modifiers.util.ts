/**
 * The modifier predicates every keyboard (and Mod+click) handler asks about.
 * Spelled out inline these read as four-line boolean chains that are easy to
 * copy with one modifier missing, which is how a "bare key" shortcut quietly
 * starts firing on Shift+key.
 *
 * The event types are structural rather than `Pick<KeyboardEvent, ...>` so
 * React synthetic events and MouseEvent (Mod+click) pass without a cast.
 */

export interface ModKeyFlags {
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
}

export interface CommandModifierFlags extends ModKeyFlags {
  readonly altKey: boolean;
}

export interface ModifierFlags extends CommandModifierFlags {
  readonly shiftKey: boolean;
}

/**
 * "Mod" is Cmd on macOS and Ctrl elsewhere. Both are accepted everywhere so a
 * single registration works on either platform without a platform read.
 */
export const isModKeyHeld = (event: ModKeyFlags): boolean =>
  event.metaKey || event.ctrlKey;

/**
 * Mod or Alt: the modifiers that turn a key into a chord owned by the browser,
 * the OS, or another app shortcut. Shift is excluded because it selects a
 * variant of the same command (Shift+Tab, Shift+arrow) rather than a new one,
 * so bare-key handlers that accept a shifted character gate on this.
 */
export const hasCommandModifier = (event: CommandModifierFlags): boolean =>
  isModKeyHeld(event) || event.altKey;

/** Any modifier at all, used to reject chords where only a bare key counts. */
export const hasAnyModifier = (event: ModifierFlags): boolean =>
  hasCommandModifier(event) || event.shiftKey;

/**
 * An unmodified Enter. Gating on this leaves Mod+Enter (save) and Shift+Enter
 * to the handlers that own those chords instead of swallowing them.
 */
export const isPlainEnterKey = (
  event: ModifierFlags & { readonly key: string },
): boolean => event.key === "Enter" && !hasAnyModifier(event);
