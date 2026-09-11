import { useEffect, useRef } from "react";

/**
 * Runs an OAuth callback exchange exactly once per mount.
 *
 * The `didRun` guard, not the empty dependency list, is what makes this a
 * one-shot: StrictMode remounts the effect in development and would otherwise
 * exchange the code twice. `start` is captured on first render because the
 * effect only ever fires then.
 *
 * `start` must handle its own rejections. Nothing catches them here, and this
 * running only once means an uncaught rejection strands the user on the
 * callback spinner with no toast and no way to retry.
 */
export function useOneShotAuthCallback(start: () => void): void {
  const didRun = useRef(false);
  const startRef = useRef(start);

  useEffect(() => {
    if (didRun.current) {
      return;
    }

    didRun.current = true;
    startRef.current();
  }, []);
}
