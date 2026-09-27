import { act, renderHook } from "@testing-library/react";
import { SIDEBAR_AUTO_COLLAPSE_BREAKPOINT } from "@web/components/AuthenticatedLayout/responsive.constants";
import { useIsNarrowSidebarLayout } from "./useIsNarrowSidebarLayout";
import { afterEach, describe, expect, it, mock } from "bun:test";

const originalMatchMedia = window.matchMedia;

function mockMatchMedia(matchesMinWidth: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let matches = matchesMinWidth;
  const query = {
    get matches() {
      return matches;
    },
    media: `(min-width: ${SIDEBAR_AUTO_COLLAPSE_BREAKPOINT}px)`,
    onchange: null,
    addEventListener: mock(
      (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
    ),
    removeEventListener: mock(
      (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
    ),
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  } as MediaQueryList;

  window.matchMedia = mock((media: string) => {
    if (media.includes(`min-width: ${SIDEBAR_AUTO_COLLAPSE_BREAKPOINT}px`)) {
      return query;
    }
    return {
      ...query,
      get matches() {
        return false;
      },
      media,
    } as MediaQueryList;
  }) as typeof window.matchMedia;

  return {
    setMatches(next: boolean) {
      matches = next;
      const event = { matches: next } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe("useIsNarrowSidebarLayout", () => {
  it("is true below the sidebar auto-collapse breakpoint", () => {
    mockMatchMedia(false);

    const { result } = renderHook(() => useIsNarrowSidebarLayout());

    expect(result.current).toBe(true);
  });

  it("is false at or above the sidebar auto-collapse breakpoint", () => {
    mockMatchMedia(true);

    const { result } = renderHook(() => useIsNarrowSidebarLayout());

    expect(result.current).toBe(false);
  });

  it("updates when the breakpoint is crossed", () => {
    const media = mockMatchMedia(true);
    const { result } = renderHook(() => useIsNarrowSidebarLayout());

    expect(result.current).toBe(false);

    act(() => {
      media.setMatches(false);
    });

    expect(result.current).toBe(true);
  });
});
