import { renderHook } from "@testing-library/react";
import { act } from "react";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { THEME_STORAGE_KEY } from "@web/settings/theme/theme.constants";
import { useThemeStore } from "@web/settings/theme/theme.store";
import { useThemeCmdItems } from "./useThemeCmdItems";
import { beforeEach, describe, expect, it } from "bun:test";

describe("useThemeCmdItems", () => {
  beforeEach(() => {
    persistentBrowserStore.remove(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute("data-theme");
    useThemeStore.setState({ theme: "dark-abyss" });
  });

  it("offers a single toggle to the other theme", () => {
    const { result } = renderHook(() => useThemeCmdItems());

    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.id).toBe("toggle-theme");
    expect(result.current[0]?.label).toBe("Switch to light theme");
  });

  it("switches to light on click, then offers the way back", () => {
    const { result } = renderHook(() => useThemeCmdItems());

    act(() => {
      result.current[0]?.onClick?.();
    });

    expect(useThemeStore.getState().theme).toBe("light-beach");
    expect(document.documentElement.getAttribute("data-theme")).toBe(
      "light-beach",
    );
    expect(result.current[0]?.label).toBe("Switch to dark theme");

    act(() => {
      result.current[0]?.onClick?.();
    });

    expect(useThemeStore.getState().theme).toBe("dark-abyss");
    expect(result.current[0]?.label).toBe("Switch to light theme");
  });
});
