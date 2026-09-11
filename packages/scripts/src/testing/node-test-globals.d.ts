import type { Mock as BunMock } from "bun:test";

declare global {
  // bun:test exports Mock, but many node tests use it without importing.
  // biome-ignore lint/suspicious/noExplicitAny: global Mock must accept arbitrary mock signatures
  type Mock<T extends (...args: any[]) => any = (...args: any[]) => any> =
    BunMock<T>;
}
