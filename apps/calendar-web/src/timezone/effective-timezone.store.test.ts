import { act, renderHook } from "@testing-library/react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import * as browserTimezone from "@web/timezone/browser-timezone";
import { getBrowserTimeZone } from "@web/timezone/browser-timezone";
import {
  getEffectiveTimeZone,
  getPinnedTimeZone,
  hydrateEffectiveTimeZonePreference,
  resetEffectiveTimeZoneStoreForTests,
  setBrowserTimeZoneForTests,
  setCalendarTimeZoneHint,
  setPinnedTimeZone,
  shouldClearAccidentalUtcPin,
  useEffectiveTimeZone,
} from "@web/timezone/effective-timezone.store";
import { snoozeTimezoneMismatch } from "@web/timezone/timezone-mismatch";
import { afterEach, describe, expect, it, spyOn } from "bun:test";

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

  it("clears an accidental UTC pin when the browser zone is not UTC", () => {
    persistentBrowserStore.set(STORAGE_KEYS.DEFAULT_TIMEZONE, "UTC");
    const browserSpy = spyOn(
      browserTimezone,
      "getBrowserTimeZone",
    ).mockReturnValue("America/Denver");

    try {
      act(() => {
        resetEffectiveTimeZoneStoreForTests();
        persistentBrowserStore.set(STORAGE_KEYS.DEFAULT_TIMEZONE, "UTC");
        hydrateEffectiveTimeZonePreference();
      });

      expect(getPinnedTimeZone()).toBeNull();
      expect(getEffectiveTimeZone()).toBe("America/Denver");
    } finally {
      browserSpy.mockRestore();
    }
  });

  it("keeps a deliberate UTC pin after the user snoozed the mismatch banner", () => {
    persistentBrowserStore.set(STORAGE_KEYS.DEFAULT_TIMEZONE, "UTC");
    const browserSpy = spyOn(
      browserTimezone,
      "getBrowserTimeZone",
    ).mockReturnValue("America/Denver");

    try {
      snoozeTimezoneMismatch("America/Denver");
      expect(shouldClearAccidentalUtcPin("UTC")).toBe(false);

      act(() => {
        hydrateEffectiveTimeZonePreference();
      });

      expect(getPinnedTimeZone()).toBe("UTC");
      expect(getEffectiveTimeZone()).toBe("UTC");
    } finally {
      browserSpy.mockRestore();
    }
  });

  it("refreshes Auto mode from Intl after a stale browser cache", () => {
    act(() => {
      resetEffectiveTimeZoneStoreForTests();
      setBrowserTimeZoneForTests("UTC");
    });
    expect(getEffectiveTimeZone()).toBe("UTC");

    const browserSpy = spyOn(
      browserTimezone,
      "getBrowserTimeZone",
    ).mockReturnValue("America/Denver");

    try {
      act(() => {
        hydrateEffectiveTimeZonePreference();
      });
      expect(getEffectiveTimeZone()).toBe("America/Denver");
    } finally {
      browserSpy.mockRestore();
    }
  });

  it("uses a calendar hint in Auto when the browser zone is UTC", () => {
    act(() => {
      resetEffectiveTimeZoneStoreForTests();
      setBrowserTimeZoneForTests("UTC");
      setCalendarTimeZoneHint("America/Denver");
    });
    expect(getEffectiveTimeZone()).toBe("America/Denver");
  });

  it("clears a UTC pin when the browser zone is also UTC", () => {
    persistentBrowserStore.set(STORAGE_KEYS.DEFAULT_TIMEZONE, "UTC");
    const browserSpy = spyOn(
      browserTimezone,
      "getBrowserTimeZone",
    ).mockReturnValue("UTC");

    try {
      act(() => {
        hydrateEffectiveTimeZonePreference();
      });
      expect(getPinnedTimeZone()).toBeNull();
    } finally {
      browserSpy.mockRestore();
    }
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
