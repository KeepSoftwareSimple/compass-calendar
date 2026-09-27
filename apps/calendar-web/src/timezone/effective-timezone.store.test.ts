import { act, renderHook } from "@testing-library/react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { getBrowserTimeZone } from "@web/common/utils/datetime/web.date.util";
import {
  getEffectiveTimeZone,
  getPinnedTimeZone,
  resetEffectiveTimeZoneStoreForTests,
  setPinnedTimeZone,
  useEffectiveTimeZone,
} from "@web/timezone/effective-timezone.store";
import { afterEach, describe, expect, it } from "bun:test";

const originalVisibilityState = document.visibilityState;

const readEffectiveTimeZone = () =>
  renderHook(useEffectiveTimeZone).result.current;

describe("effective-timezone.store", () => {
  afterEach(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: originalVisibilityState,
    });
    act(() => {
      resetEffectiveTimeZoneStoreForTests();
    });
  });

  it("defaults to the browser timezone", () => {
    expect(readEffectiveTimeZone()).toBe(getBrowserTimeZone());
    expect(getPinnedTimeZone()).toBeNull();
  });

  it("pins a zone until Auto is restored", () => {
    const { result } = renderHook(useEffectiveTimeZone);

    act(() => {
      setPinnedTimeZone("America/Denver");
    });

    expect(result.current).toBe("America/Denver");
    expect(getPinnedTimeZone()).toBe("America/Denver");

    act(() => {
      setPinnedTimeZone(null);
    });

    expect(result.current).toBe(getBrowserTimeZone());
    expect(getPinnedTimeZone()).toBeNull();
  });

  it("pins even when the zone matches the browser", () => {
    const browserZone = getBrowserTimeZone();
    act(() => {
      setPinnedTimeZone(browserZone);
    });

    expect(getPinnedTimeZone()).toBe(browserZone);
    expect(getEffectiveTimeZone()).toBe(browserZone);
  });

  it("persists a pin and hydrates it from storage", () => {
    act(() => {
      setPinnedTimeZone("Pacific/Auckland");
    });

    expect(persistentBrowserStore.get(STORAGE_KEYS.DEFAULT_TIMEZONE)).toBe(
      "Pacific/Auckland",
    );

    act(() => {
      resetEffectiveTimeZoneStoreForTests();
    });
    expect(getPinnedTimeZone()).toBeNull();

    persistentBrowserStore.set(
      STORAGE_KEYS.DEFAULT_TIMEZONE,
      "Pacific/Auckland",
    );
    const { result } = renderHook(useEffectiveTimeZone);

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEYS.DEFAULT_TIMEZONE,
          newValue: "Pacific/Auckland",
        }),
      );
    });

    expect(result.current).toBe("Pacific/Auckland");
  });

  it("rejects an invalid IANA zone", () => {
    expect(setPinnedTimeZone("Not/AZone")).toBe(false);
    expect(getPinnedTimeZone()).toBeNull();
  });

  it("keeps a pinned zone when the tab becomes visible", () => {
    act(() => {
      setPinnedTimeZone("America/Denver");
    });

    const { result } = renderHook(useEffectiveTimeZone);
    expect(result.current).toBe("America/Denver");

    act(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toBe("America/Denver");
  });

  it("returns to the browser zone when Auto and the tab becomes visible", () => {
    const { result } = renderHook(useEffectiveTimeZone);

    act(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toBe(getBrowserTimeZone());
  });
});
