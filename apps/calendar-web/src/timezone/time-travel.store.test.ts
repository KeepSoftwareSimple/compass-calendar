import { act, renderHook } from "@testing-library/react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  getTimeTravelZone,
  resetTimeTravelStoreForTests,
  setTimeTravelZone,
  useTimeTravelZone,
} from "@web/timezone/time-travel.store";
import { afterEach, describe, expect, it } from "bun:test";

afterEach(() => {
  act(() => {
    resetTimeTravelStoreForTests();
  });
});

describe("time-travel store", () => {
  it("starts off and persists a secondary zone", () => {
    expect(getTimeTravelZone()).toBeNull();

    expect(setTimeTravelZone("America/Denver")).toBe(true);
    expect(getTimeTravelZone()).toBe("America/Denver");
    expect(persistentBrowserStore.get(STORAGE_KEYS.TIME_TRAVEL_TIMEZONE)).toBe(
      "America/Denver",
    );
  });

  it("survives a remount from storage", () => {
    setTimeTravelZone("Europe/London");
    const { result, unmount } = renderHook(() => useTimeTravelZone());
    expect(result.current).toBe("Europe/London");
    unmount();

    const remounted = renderHook(() => useTimeTravelZone());
    expect(remounted.result.current).toBe("Europe/London");
  });

  it("dismisses the secondary zone", () => {
    setTimeTravelZone("America/Chicago");
    expect(setTimeTravelZone(null)).toBe(true);
    expect(getTimeTravelZone()).toBeNull();
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.TIME_TRAVEL_TIMEZONE),
    ).toBeNull();
  });

  it("ignores an invalid IANA id", () => {
    expect(setTimeTravelZone("Not/AZone")).toBe(false);
    expect(getTimeTravelZone()).toBeNull();
  });
});
