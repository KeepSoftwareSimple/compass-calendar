import { getPosthogClient } from "@web/auth/posthog/posthog.bootstrap";
import { reloadLocation } from "@web/common/utils/browser/browser-navigation.util";

// A deploy replaces every hashed chunk, so a tab that loaded index.html
// before the deploy and imports a chunk after it gets a 404 dressed up by
// the browser as one of these messages. index.html itself is served
// `no-cache`, so one reload fetches the new chunk names and recovers.
// TanStack Router's lazyRouteComponent already does this for its own
// components. The app boot import, the error boundary, and every raw
// post-boot import() go through this guard instead (PostHog issue 019a097a:
// production 2026-09-11 at boot, 2026-09-24 from the SSE auth path).
const MISSING_CHUNK_MESSAGES = [
  "Failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "Importing a module script failed",
];

const RELOAD_KEY_PREFIX = "compass_missing_chunk_reload:";

type MissingChunkReloadSource =
  | "app-boot"
  | "react-error-boundary"
  | "lazy-import";

export function isMissingChunkError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    MISSING_CHUNK_MESSAGES.some((message) => error.message.includes(message))
  );
}

// Reloads the page at most once per missing chunk, keyed on the error message
// (which names the chunk URL) so a reload that STILL fails falls through to
// the caller's error UI instead of looping. Returns true when a reload was
// triggered, so the caller can stop rendering. Each reload is counted as
// `missing_chunk_reload`; a chunk $exception after one means it did not help.
export function reloadOnceForMissingChunk(
  error: unknown,
  source: MissingChunkReloadSource,
  storage: Pick<Storage, "getItem" | "setItem"> = sessionStorage,
  reload: () => void = reloadLocation,
): boolean {
  if (!isMissingChunkError(error)) return false;
  const key = `${RELOAD_KEY_PREFIX}${error.message}`;
  try {
    if (storage.getItem(key)) return false;
    storage.setItem(key, "1");
  } catch {
    // Storage disabled (private mode, blocked site data): a reload with no
    // guard could loop, so show the error page instead.
    return false;
  }
  try {
    getPosthogClient()?.capture(
      "missing_chunk_reload",
      { source },
      { send_instantly: true },
    );
  } catch {
    // Analytics must never block the recovery it measures.
  }
  reload();
  return true;
}

// Wraps a post-boot import(). A missing chunk reloads the page once and the
// returned promise never settles, so the caller neither renders nor reports
// a failure the reload replaces. Other errors still reject.
export function importOrReload<T>(importer: () => Promise<T>): Promise<T> {
  return importer().catch((error: unknown) => {
    if (reloadOnceForMissingChunk(error, "lazy-import")) {
      return new Promise<T>(() => {});
    }
    throw error;
  });
}
