import { setupServer } from "msw/node";
import { globalHandlers } from "./mock.handlers";

// This configures a request mocking server with the given request handlers.
export const server = setupServer(...globalHandlers);

/**
 * Close and listen again so MSW re-patches fetch/XHR after Bun `--isolate`
 * clears `globalThis` between files. The preload module is not reloaded, so
 * `listen()` alone is a no-op while the network is still marked enabled.
 */
export function restartMockServer(): void {
  server.close();
  server.listen({ onUnhandledRequest: "error" });
}
