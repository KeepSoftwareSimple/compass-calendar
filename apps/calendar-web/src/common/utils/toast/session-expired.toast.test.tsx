import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, within } from "@testing-library/react";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { SessionExpiredToast } from "@web/common/utils/toast/session-expired.toast";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import * as realRouters from "@web/routers";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockNavigate = mock();

mockModuleForFile("@web/routers", realRouters, {
  router: { navigate: mockNavigate },
});

describe("SessionExpiredToast", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
    mockNavigate.mockClear();
    mocks.dismiss.mockClear();
    registerToastPort(port);
  });

  it("shows an S keycap and signs in when S is pressed", () => {
    render(
      <HotkeysProvider>
        <SessionExpiredToast toastId="session-expired-api" />
      </HotkeysProvider>,
    );

    expect(
      within(screen.getByRole("button", { name: "Sign in" })).getByText("S"),
    ).toBeTruthy();
    expect(screen.getByText("Press Esc to dismiss")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();

    pressKey("S");

    expect(mocks.dismiss).toHaveBeenCalledWith("session-expired-api");
  });
});
