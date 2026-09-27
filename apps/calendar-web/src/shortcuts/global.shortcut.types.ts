export interface ShortcutContext {
  isFormOpen?: boolean;
  lifeView?: boolean;
  weekView?: boolean;
  /** Only listed while a Stripe trial is running. */
  isTrialing?: boolean;
}

export interface Shortcut {
  id: string;
  keys: string[];
  label: string;
  section: string;
  when?: ShortcutContext;
  /**
   * True when this shortcut creates or mutates events. The `?` legend shows a
   * Pro badge on these rows while billing is read-only, so muscle memory can
   * see the lock before the key fires.
   */
  requiresWrite?: boolean;
  /** Display-only: this write shortcut is currently locked behind billing. */
  locked?: boolean;
  /** True when this browser has invoked the shortcut (legend check mark). */
  used?: boolean;
}
