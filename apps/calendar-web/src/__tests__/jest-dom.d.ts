import { type TestingLibraryMatchers } from "@types/testing-library__jest-dom/matchers";

declare module "bun:test" {
  interface Matchers<T = unknown>
    extends TestingLibraryMatchers<typeof expect.stringContaining, void> {}
}
