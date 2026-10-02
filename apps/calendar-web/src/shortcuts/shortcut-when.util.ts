import { type ShortcutContext } from "@core/shortcuts/shortcut.types";

/** Resolve declarative `when` predicates against live app state. */
export const shortcutWhenMatches = (
  when: ShortcutContext | undefined,
  context: ShortcutContext,
): boolean => {
  if (!when) return true;
  if (when.lifeView === true && context.lifeView !== true) return false;
  if (when.weekView === true && context.weekView !== true) return false;
  if (when.isFormOpen === true && context.isFormOpen !== true) return false;
  if (when.isTrialing === true && context.isTrialing !== true) return false;
  return true;
};
