import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { fireEvent, render, screen } from "@testing-library/react";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { APP_UPDATE_AVAILABLE_TOAST_ID } from "@web/common/constants/toast.constants";
import * as realBrowserNavigation from "@web/common/utils/browser/browser-navigation.util";
import {
  APP_UPDATE_TOAST_MESSAGE,
  AppUpdateAvailableToast,
  showAppUpdateAvailableToast,
} from "@web/common/utils/toast/app-update-available.toast";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const reloadLocation = mock();
mockModuleForFile(
  "@web/common/utils/browser/browser-navigation.util",
  realBrowserNavigation,
  { reloadLocation },
);

describe("AppUpdateAvailableToast", () => {
  it("renders one line, a reload shortcut, and a dismiss control", () => {
    render(
      <HotkeysProvider>
        <AppUpdateAvailableToast />
      </HotkeysProvider>,
    );

    expect(screen.getByText(APP_UPDATE_TOAST_MESSAGE)).toBeInTheDocument();
    const refresh = screen.getByRole("button", { name: /Refresh/i });
    expect(refresh).toBeInTheDocument();
    expect(refresh.className).toContain("c-button-primary");
    expect(
      screen.getByRole("button", { name: "Dismiss update notice" }),
    ).toBeInTheDocument();
    expect(refresh.textContent).toMatch(/R/);
  });

  it("reloads from the main action and dismisses from ×", () => {
    const { port, mocks } = createTestToastPort();
    registerToastPort(port);

    render(
      <HotkeysProvider>
        <AppUpdateAvailableToast />
      </HotkeysProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Refresh/i }));
    expect(reloadLocation).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss update notice" }),
    );
    expect(mocks.dismiss).toHaveBeenCalledWith(APP_UPDATE_AVAILABLE_TOAST_ID);
  });
});

describe("showAppUpdateAvailableToast", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    mocks.toast.mockClear();
    mocks.update.mockClear();
    mocks.isActive.mockReturnValue(false);
    reloadLocation.mockClear();
    registerToastPort(port);
  });

  it("shows once under a stable toast id when the same version is detected twice", () => {
    mocks.isActive.mockImplementation(
      () =>
        mocks.toast.mock.calls.length > 0 || mocks.update.mock.calls.length > 0,
    );

    showAppUpdateAvailableToast("1.0.1");
    showAppUpdateAvailableToast("1.0.1");

    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith(
      APP_UPDATE_AVAILABLE_TOAST_ID,
      expect.objectContaining({ toastId: APP_UPDATE_AVAILABLE_TOAST_ID }),
    );
    expect((mocks.toast.mock.calls[0] as unknown[])[1]).toMatchObject({
      toastId: APP_UPDATE_AVAILABLE_TOAST_ID,
      autoClose: false,
      closeOnClick: false,
    });
  });

  it("updates the existing toast when a newer version is detected", () => {
    mocks.isActive.mockImplementation(
      () =>
        mocks.toast.mock.calls.length > 0 || mocks.update.mock.calls.length > 0,
    );

    showAppUpdateAvailableToast("1.0.1");
    showAppUpdateAvailableToast("1.0.2");

    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith(
      APP_UPDATE_AVAILABLE_TOAST_ID,
      expect.objectContaining({
        toastId: APP_UPDATE_AVAILABLE_TOAST_ID,
        autoClose: false,
        closeOnClick: false,
      }),
    );
  });
});
