import type { Mock as BunMock } from "bun:test";

declare module "bun:test" {
  namespace JestMock {
    interface MockFunctionState<T extends FunctionLike = FunctionLike> {
      calls: unknown[][];
      instances: unknown[];
      contexts: unknown[];
      invocationCallOrder: number[];
      lastCall?: unknown[];
      results: Array<{ type: string; value?: unknown }>;
    }
  }
}

declare global {
  // bun:test exports Mock, but many node tests use it without importing.
  type Mock<
    T extends (...args: unknown[]) => unknown = (...args: unknown[]) => unknown,
  > = BunMock<T>;
}
