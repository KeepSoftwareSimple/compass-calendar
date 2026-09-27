import { act, renderHook } from "@testing-library/react";
import { SIDEBAR_AUTO_COLLAPSE_BREAKPOINT } from "@web/components/AuthenticatedLayout/responsive.constants";
import {
  selectIsSidebarOpen,
  useViewStore,
  viewActions,
} from "@web/events/stores/view.store";
import { useResponsiveLayout } from "./useResponsiveLayout";
import { afterEach, describe, expect, it, mock } from "bun:test";

// Helper to create a mock matchMedia list for a single query
const createMediaQueryMock = (initialMatches: boolean) => {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];
  let matches = initialMatches;
  return {
    get matches() {
      return matches;
    },
    media: "",
    onchange: null,
    addListener: mock(),
    removeListener: mock(),
    addEventListener: mock(
      (_event: string, listener: (e: MediaQueryListEvent) => void) => {
        listeners.push(listener);
      },
    ),
    removeEventListener: mock(
      (_event: string, listener: (e: MediaQueryListEvent) => void) => {
        const index = listeners.indexOf(listener);
        if (index !== -1) listeners.splice(index, 1);
      },
    ),
    dispatchEvent: mock(),
    _triggerChange: (newMatches: boolean) => {
      matches = newMatches;
      listeners.forEach((listener) => {
        listener({ matches: newMatches } as MediaQueryListEvent);
      });
    },
  };
};

/**
 * Installs a matchMedia mock for the sidebar breakpoint.
 */
const setupMatchMedia = ({ sidebarMatches }: { sidebarMatches: boolean }) => {
  const sidebarQuery = createMediaQueryMock(sidebarMatches);

  window.matchMedia = mock((query: string) => {
    if (query.includes(`${SIDEBAR_AUTO_COLLAPSE_BREAKPOINT}px`)) {
      return sidebarQuery as unknown as MediaQueryList;
    }
    throw new Error(`Unexpected media query: ${query}`);
  });

  return { sidebarQuery };
};

const getIsSidebarOpen = () => selectIsSidebarOpen(useViewStore.getState());

describe("useResponsiveLayout sidebar", () => {
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("should open the sidebar on mount when screen is wide (>=1280px)", () => {
    setupMatchMedia({ sidebarMatches: true });

    renderHook(() => useResponsiveLayout());

    expect(getIsSidebarOpen()).toBe(true);
  });

  it("should close the sidebar on mount when screen is narrow (<1280px)", () => {
    setupMatchMedia({ sidebarMatches: false });

    renderHook(() => useResponsiveLayout());

    expect(getIsSidebarOpen()).toBe(false);
  });

  it("should close the sidebar when screen resizes from wide to narrow", () => {
    const { sidebarQuery } = setupMatchMedia({
      sidebarMatches: true,
    });

    renderHook(() => useResponsiveLayout());

    expect(getIsSidebarOpen()).toBe(true);

    act(() => {
      sidebarQuery._triggerChange(false);
    });

    expect(getIsSidebarOpen()).toBe(false);
  });

  it("should open the sidebar when screen resizes from narrow to wide", () => {
    const { sidebarQuery } = setupMatchMedia({
      sidebarMatches: false,
    });

    renderHook(() => useResponsiveLayout());

    expect(getIsSidebarOpen()).toBe(false);

    act(() => {
      sidebarQuery._triggerChange(true);
    });

    expect(getIsSidebarOpen()).toBe(true);
  });

  it("should keep a manual toggle until the next breakpoint crossing", () => {
    const { sidebarQuery } = setupMatchMedia({ sidebarMatches: false });

    const { rerender } = renderHook(() => useResponsiveLayout());

    expect(getIsSidebarOpen()).toBe(false);

    // User reopens the sidebar while narrow; no crossing happens, so it sticks
    act(() => {
      viewActions.toggleSidebar();
    });
    rerender();

    expect(getIsSidebarOpen()).toBe(true);

    // The next crossing takes over again
    act(() => {
      sidebarQuery._triggerChange(true);
    });
    act(() => {
      sidebarQuery._triggerChange(false);
    });

    expect(getIsSidebarOpen()).toBe(false);
  });

  it("should respect a saved closed preference on mount when screen is wide", () => {
    viewActions.setSidebarOpen(false);
    setupMatchMedia({ sidebarMatches: true });

    renderHook(() => useResponsiveLayout());

    expect(getIsSidebarOpen()).toBe(false);
  });

  it("should ignore a saved open preference on mount when screen is narrow", () => {
    viewActions.setSidebarOpen(true);
    setupMatchMedia({ sidebarMatches: false });

    renderHook(() => useResponsiveLayout());

    expect(getIsSidebarOpen()).toBe(false);
  });

  it("should restore a saved closed preference when crossing back to wide", () => {
    viewActions.setSidebarOpen(false);
    const { sidebarQuery } = setupMatchMedia({
      sidebarMatches: false,
    });

    renderHook(() => useResponsiveLayout());

    expect(getIsSidebarOpen()).toBe(false);

    act(() => {
      sidebarQuery._triggerChange(true);
    });

    expect(getIsSidebarOpen()).toBe(false);
  });

  it("should remove the media query listeners on unmount", () => {
    const { sidebarQuery } = setupMatchMedia({ sidebarMatches: true });

    const { unmount } = renderHook(() => useResponsiveLayout());
    unmount();

    expect(sidebarQuery.removeEventListener).toHaveBeenCalledTimes(1);

    act(() => {
      sidebarQuery._triggerChange(false);
    });

    expect(getIsSidebarOpen()).toBe(true);
  });
});
