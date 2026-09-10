import { type Mock, mock } from "bun:test";

/** Mock with widened `mock.calls` typing for Bun's zero-arg mock inference. */
export type MockWithCalls<T extends (...args: unknown[]) => unknown> =
  Mock<T> & {
    mock: {
      calls: unknown[][];
    };
  };

export function typedMock<T extends (...args: unknown[]) => unknown>(
  implementation: T,
): MockWithCalls<T> {
  return mock(implementation) as MockWithCalls<T>;
}

export function mockCall<T extends unknown[]>(
  fn: { mock: { calls: readonly (readonly unknown[])[] } },
  callIndex: number,
): T {
  const row = fn.mock.calls.at(callIndex);
  if (!row) {
    throw new Error(`Expected mock call at index ${callIndex}`);
  }
  return row as T;
}

export function mockCallArg<T>(
  fn: { mock: { calls: readonly (readonly unknown[])[] } },
  callIndex: number,
  argIndex: number,
): T {
  const row = mockCall<unknown[]>(fn, callIndex);
  const value = row.at(argIndex);
  if (value === undefined) {
    throw new Error(
      `Expected mock call ${callIndex} to have argument at index ${argIndex}`,
    );
  }
  return value as T;
}
