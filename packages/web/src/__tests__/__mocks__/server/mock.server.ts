import { setupServer } from "msw/node";
import { globalHandlers } from "./mock.handlers";

// This configures a request mocking server with the given request handlers.
export const server = setupServer(...globalHandlers);

/**
 * Close and listen again so MSW re-patches fetch/XHR after Bun `--isolate`
 * clears `globalThis` between files. The preload module is not reloaded.
 */
export function restartMockServer(): void {
  try {
    server.close();
  } catch {
    // First file in a worker has not listened yet.
  }
  server.listen({ onUnhandledRequest: "error" });
}
