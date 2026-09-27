import { afterAll, mock } from "bun:test";

/**
 * `mock.module` is process-wide and permanent. A factory registered by one
 * test file keeps answering that specifier for every file bun runs after it,
 * so a factory returning only the exports one file cares about silently
 * deletes the rest for everyone downstream — and the module's own test file
 * then exercises the mock instead of the implementation. The failure lands in
 * an unrelated file and only for some file orderings, which is why it reads as
 * flakiness rather than as a mock that was never cleaned up.
 *
 * This registers the mock the way that survives: spread the real namespace so
 * untouched exports keep working, and route each override through a flag that
 * this file's `afterAll` flips back off.
 *
 * Callers pass the real namespace rather than a specifier so the capture is a
 * plain static import — `await import(someVariable)` resolves relative to this
 * file, not the caller, and would silently miss relative specifiers.
 *
 *     import * as realSseClient from "@web/sse/client/sse.client";
 *
 *     mockModuleForFile("@web/sse/client/sse.client", realSseClient, {
 *       openStream,
 *       closeStream,
 *     });
 *
 * Function overrides delegate at call time, so even a consumer that imported
 * during this file recovers the real behavior afterwards. Non-function
 * overrides (constants, contexts) can only swap back for consumers importing
 * after the flip — prefer wrapping the tree in a real provider over mocking a
 * context module at all.
 */
export function mockModuleForFile<T extends Record<string, unknown>>(
  specifier: string,
  actualNamespace: T,
  overrides: Partial<Record<keyof T | (string & {}), unknown>>,
): void {
  const actual = { ...actualNamespace } as Record<string, unknown>;
  let isMocked = true;

  afterAll(() => {
    isMocked = false;
  });

  const wrapped: Record<string, unknown> = { ...actual };

  for (const [key, override] of Object.entries(overrides)) {
    if (typeof override === "function") {
      wrapped[key] = (...args: unknown[]) => {
        if (isMocked)
          return (override as (...a: unknown[]) => unknown)(...args);
        const real = actual[key];
        if (typeof real !== "function") {
          throw new Error(
            `mockModuleForFile: ${specifier} has no callable export "${key}" to restore`,
          );
        }
        return (real as (...a: unknown[]) => unknown)(...args);
      };
      continue;
    }

    Object.defineProperty(wrapped, key, {
      configurable: true,
      enumerable: true,
      get: () => (isMocked ? override : actual[key]),
    });
  }

  mock.module(specifier, () => wrapped);
}
