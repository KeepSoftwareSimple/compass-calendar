import { type ServerMessage } from "@core/types/server-message.contracts";

/** Mirrors sse.client's listener-set convention for tests that fake `onServerMessage`. */
export function createFakeServerMessageBus() {
  const listenersByType = new Map<
    ServerMessage["type"],
    Set<(message: ServerMessage) => void>
  >();

  function onServerMessage<T extends ServerMessage["type"]>(
    type: T,
    handler: (message: Extract<ServerMessage, { type: T }>) => void,
  ): () => void {
    let listeners = listenersByType.get(type);
    if (!listeners) {
      listeners = new Set();
      listenersByType.set(type, listeners);
    }
    const listener = (message: ServerMessage) => handler(message as never);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function emit(message: ServerMessage): void {
    for (const listener of listenersByType.get(message.type) ?? []) {
      listener(message);
    }
  }

  return { onServerMessage, emit, clear: () => listenersByType.clear() };
}
