import { HotkeysProvider, resolveModifier } from "@tanstack/react-hotkeys";
import { renderHook } from "@testing-library/react";
import { type PropsWithChildren } from "react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realBrowserNavigation from "@web/common/utils/browser/browser-navigation.util";
import { afterEach, describe, expect, it, mock } from "bun:test";

const reloadLocation = mock();
mockModuleForFile(
  "@web/common/utils/browser/browser-navigation.util",
  realBrowserNavigation,
  { reloadLocation },
);

const { useReloadAppShortcut } = await import("./useReloadAppShortcut");

describe("useReloadAppShortcut", () => {
  afterEach(() => {
    reloadLocation.mockClear();
  });

  it("reloads on Mod+R while enabled", () => {
    const wrapper = ({ children }: PropsWithChildren) => (
      <HotkeysProvider>{children}</HotkeysProvider>
    );
    renderHook(() => useReloadAppShortcut(true), { wrapper });

    const isCtrl = resolveModifier("Mod") === "Control";
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "r",
        code: "KeyR",
        ctrlKey: isCtrl,
        metaKey: !isCtrl,
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(reloadLocation).toHaveBeenCalledTimes(1);
  });
});
