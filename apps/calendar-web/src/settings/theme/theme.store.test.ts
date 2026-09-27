import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { THEME_STORAGE_KEY } from "./theme.constants";
import { themeActions, useThemeStore } from "./theme.store";
import { readStoredTheme } from "./theme.util";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

function stubColorScheme(light: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: light && query.includes("prefers-color-scheme: light"),
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return true;
    },
  })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

describe("theme store + util", () => {
  let restoreMatchMedia: (() => void) | undefined;

  beforeEach(() => {
    persistentBrowserStore.remove(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute("data-theme");
    useThemeStore.setState({ theme: "dark-abyss" });
  });

  afterEach(() => {
    restoreMatchMedia?.();
    restoreMatchMedia = undefined;
  });

  it("uses the light default when nothing is stored, even if OS is dark", () => {
    restoreMatchMedia = stubColorScheme(false);
    expect(readStoredTheme()).toBe("light-beach");
  });

  it("uses the light default when nothing is stored and OS is light", () => {
    restoreMatchMedia = stubColorScheme(true);
    expect(readStoredTheme()).toBe("light-beach");
  });

  it("falls back to the light default for an unknown stored value", () => {
    restoreMatchMedia = stubColorScheme(false);
    persistentBrowserStore.set(THEME_STORAGE_KEY, "neon-swamp");
    expect(readStoredTheme()).toBe("light-beach");
  });

  it("reads back a valid stored theme", () => {
    restoreMatchMedia = stubColorScheme(true);
    persistentBrowserStore.set(THEME_STORAGE_KEY, "dark-abyss");
    expect(readStoredTheme()).toBe("dark-abyss");
  });

  it("reads a stored light theme even when OS is dark", () => {
    restoreMatchMedia = stubColorScheme(false);
    persistentBrowserStore.set(THEME_STORAGE_KEY, "light-beach");
    expect(readStoredTheme()).toBe("light-beach");
  });

  it("setTheme updates state, persists, and sets the data-theme attribute", () => {
    themeActions.setTheme("light-beach");

    expect(useThemeStore.getState().theme).toBe("light-beach");
    expect(persistentBrowserStore.get(THEME_STORAGE_KEY)).toBe("light-beach");
    expect(document.documentElement.getAttribute("data-theme")).toBe(
      "light-beach",
    );
  });

  it("setTheme back to dark writes the explicit dark attribute", () => {
    themeActions.setTheme("light-beach");
    themeActions.setTheme("dark-abyss");

    expect(document.documentElement.getAttribute("data-theme")).toBe(
      "dark-abyss",
    );
    expect(persistentBrowserStore.get(THEME_STORAGE_KEY)).toBe("dark-abyss");
  });
});
