// A deploy replaces every hashed chunk, so a tab that loaded index.html
// before the deploy and imports a chunk after it gets a 404 dressed up by
// the browser as one of these messages. index.html itself is served
// `no-cache`, so one reload fetches the new chunk names and recovers.
// TanStack Router already does exactly this for lazy route components; this
// covers the app's own boot import, which runs before the router exists and
// otherwise strands the user on the "ran aground" page (PostHog issue
// 019a097a, production 2026-09-11).
const MISSING_CHUNK_MESSAGES = [
  "Failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "Importing a module script failed",
];

const RELOAD_KEY_PREFIX = "compass_missing_chunk_reload:";

export function isMissingChunkError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    MISSING_CHUNK_MESSAGES.some((message) => error.message.includes(message))
  );
}

// Reloads the page at most once per missing chunk, keyed on the error message
// (which names the chunk URL) so a reload that STILL fails falls through to
// the caller's error UI instead of looping. Returns true when a reload was
// triggered, so the caller can stop rendering.
export function reloadOnceForMissingChunk(
  error: unknown,
  storage: Pick<Storage, "getItem" | "setItem"> = sessionStorage,
  reload: () => void = () => window.location.reload(),
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
  reload();
  return true;
}
