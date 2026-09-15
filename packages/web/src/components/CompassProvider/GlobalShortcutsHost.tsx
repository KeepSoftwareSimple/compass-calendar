import { RecurrenceScopeOpportunityHost } from "@web/events/recurrence/RecurrenceScopeOpportunityHost";
import { useUndoRedoShortcuts } from "@web/views/Week/hooks/shortcuts/useUndoRedoShortcuts";

/**
 * Mount once under {@link HotkeysProvider} and inside React Router so
 * {@link useGlobalShortcuts} can register app hotkeys (via useAppShortcut).
 * Lives on the lazy Root view, not CompassProvider, so undo/recurrence
 * mutations stay off the boot graph.
 */
export function GlobalShortcutsHost() {
  useUndoRedoShortcuts();
  return <RecurrenceScopeOpportunityHost />;
}
