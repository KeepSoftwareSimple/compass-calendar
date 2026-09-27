import { act, renderHook } from "@testing-library/react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { readRecentCommandIds } from "./recent-commands.storage";
import {
  recordRecentCommand,
  useRecentCommandIds,
} from "./recent-commands.store";
import { describe, expect, it, spyOn } from "bun:test";

// Storage clearing + the recent-commands store resync between tests are both
// handled by the global test-lifecycle afterEach (resetBrowserState +
// resetAllStores) - see apps/calendar-web/src/__tests__/setup/test-lifecycle.ts.

describe("recent-commands.store", () => {
  it("records a command and notifies subscribers", () => {
    const { result } = renderHook(() => useRecentCommandIds());
    expect(result.current).toEqual([]);

    act(() => recordRecentCommand("create-event"));

    expect(result.current).toEqual(["create-event"]);
    expect(readRecentCommandIds()).toEqual(["create-event"]);
  });

  it("moves a repeated command to the front instead of duplicating it", () => {
    const { result } = renderHook(() => useRecentCommandIds());

    act(() => recordRecentCommand("create-event"));
    act(() => recordRecentCommand("toggle-theme"));
    act(() => recordRecentCommand("create-event"));

    expect(result.current).toEqual(["create-event", "toggle-theme"]);
  });

  it("caps the list at 8, dropping the oldest", () => {
    const { result } = renderHook(() => useRecentCommandIds());

    for (let i = 0; i < 9; i += 1) {
      act(() => recordRecentCommand(`command-${i}`));
    }

    expect(result.current).toHaveLength(8);
    expect(result.current[0]).toBe("command-8");
    expect(result.current).not.toContain("command-0");
  });

  it("leaves the store untouched when the storage write fails", () => {
    const setSpy = spyOn(persistentBrowserStore, "set").mockReturnValue(false);
    const { result } = renderHook(() => useRecentCommandIds());

    act(() => recordRecentCommand("create-event"));

    expect(result.current).toEqual([]);
    setSpy.mockRestore();
  });

  it("falls back to an empty list for corrupt storage", () => {
    persistentBrowserStore.set(STORAGE_KEYS.RECENT_COMMANDS, "{not json");

    expect(readRecentCommandIds()).toEqual([]);
  });

  it("picks up a write from another tab via the storage event", () => {
    const { result } = renderHook(() => useRecentCommandIds());
    expect(result.current).toEqual([]);

    persistentBrowserStore.set(
      STORAGE_KEYS.RECENT_COMMANDS,
      JSON.stringify(["create-event"]),
    );
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEYS.RECENT_COMMANDS }),
      );
    });

    expect(result.current).toEqual(["create-event"]);
  });
});
