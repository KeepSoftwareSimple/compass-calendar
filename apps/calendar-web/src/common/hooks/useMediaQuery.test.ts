import { act, renderHook } from "@testing-library/react";
import { useMediaQuery } from "@web/common/hooks/useMediaQuery";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

describe("useMediaQuery", () => {
  const originalMatchMedia = window.matchMedia;
  let listeners: Array<(event: MediaQueryListEvent) => void>;
  let currentMatches: boolean;

  beforeEach(() => {
    listeners = [];
    currentMatches = true;
    window.matchMedia = mock((query: string) => ({
      get matches() {
        return currentMatches;
      },
      media: query,
      onchange: null,
      addListener: mock(),
      removeListener: mock(),
      addEventListener: mock(
        (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          listeners.push(listener);
        },
      ),
      removeEventListener: mock(
        (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          listeners = listeners.filter((entry) => entry !== listener);
        },
      ),
      dispatchEvent: mock(() => false),
    })) as typeof window.matchMedia;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("returns the initial match and updates on change", () => {
    const { result } = renderHook(() => useMediaQuery("(min-width: 800px)"));

    expect(result.current).toBe(true);

    act(() => {
      currentMatches = false;
      for (const listener of listeners) {
        listener({ matches: false } as MediaQueryListEvent);
      }
    });

    expect(result.current).toBe(false);
  });
});
