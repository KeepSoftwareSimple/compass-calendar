import { act, renderHook } from "@testing-library/react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { readCollapsedAccountKeys } from "./collapsed-accounts.storage";
import {
  toggleAccountCollapsed,
  useCollapsedAccountKeys,
} from "./collapsed-accounts.store";
import { describe, expect, it, spyOn } from "bun:test";

const email = "ahab@pequod.com";

// Storage clearing + the collapsed-accounts store resync between tests are
// both handled by the global test-lifecycle afterEach (resetBrowserState +
// resetAllStores) - see apps/calendar-web/src/__tests__/setup/test-lifecycle.ts.

describe("collapsed-accounts.store", () => {
  it("persists a toggle and notifies subscribers", () => {
    const { result } = renderHook(() => useCollapsedAccountKeys());

    expect(result.current.has(email)).toBe(false);

    act(() => {
      expect(toggleAccountCollapsed(email)).toBe(true);
    });

    expect(result.current.has(email)).toBe(true);
    expect(readCollapsedAccountKeys().has(email)).toBe(true);

    act(() => {
      expect(toggleAccountCollapsed(email)).toBe(true);
    });

    expect(result.current.has(email)).toBe(false);
  });

  it("leaves the store untouched when the storage write fails", () => {
    const setSpy = spyOn(persistentBrowserStore, "set").mockReturnValue(false);
    const { result } = renderHook(() => useCollapsedAccountKeys());

    act(() => {
      expect(toggleAccountCollapsed(email)).toBe(false);
    });

    expect(result.current.has(email)).toBe(false);
    setSpy.mockRestore();
  });

  it("picks up a collapse written by another tab via the storage event", () => {
    const { result } = renderHook(() => useCollapsedAccountKeys());
    expect(result.current.has(email)).toBe(false);

    persistentBrowserStore.set(
      STORAGE_KEYS.COLLAPSED_ACCOUNTS,
      JSON.stringify([email]),
    );
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEYS.COLLAPSED_ACCOUNTS }),
      );
    });

    expect(result.current.has(email)).toBe(true);
  });

  it("ignores storage events for unrelated keys", () => {
    const { result } = renderHook(() => useCollapsedAccountKeys());

    persistentBrowserStore.set(
      STORAGE_KEYS.COLLAPSED_ACCOUNTS,
      JSON.stringify([email]),
    );
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEYS.SIDEBAR_OPEN }),
      );
    });

    expect(result.current.has(email)).toBe(false);
  });
});
