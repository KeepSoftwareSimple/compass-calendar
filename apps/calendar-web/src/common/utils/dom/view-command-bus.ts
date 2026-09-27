// Plain pub/sub for view commands issued outside the components that handle
// them (shortcuts, command palette). No payloads, so a listener Set per
// command is all that's needed.
type ViewCommand =
  | "CREATE_ALLDAY_DRAFT"
  | "CREATE_TIMED_DRAFT"
  | "SCROLL_TO_NOW_LINE";

const listenersByCommand: Record<ViewCommand, Set<() => void>> = {
  CREATE_ALLDAY_DRAFT: new Set(),
  CREATE_TIMED_DRAFT: new Set(),
  SCROLL_TO_NOW_LINE: new Set(),
};

export function onViewCommand(
  command: ViewCommand,
  listener: () => void,
): () => void {
  const listeners = listenersByCommand[command];
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitViewCommand(command: ViewCommand): void {
  for (const listener of listenersByCommand[command]) listener();
}
