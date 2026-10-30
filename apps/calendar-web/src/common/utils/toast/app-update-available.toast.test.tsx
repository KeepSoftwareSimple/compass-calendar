import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen } from "@testing-library/react";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realBrowserNavigation from "@web/common/utils/browser/browser-navigation.util";
import {
  APP_UPDATE_TOAST_MESSAGE,
  AppUpdateAvailableToast,
  appUpdateToastIdForVersion,
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
  it("renders update copy and the Mod+R hint", () => {
    render(
      <HotkeysProvider>
        <AppUpdateAvailableToast
          toastId={appUpdateToastIdForVersion("1.0.1")}
        />
      </HotkeysProvider>,
    );

    expect(screen.getByText(APP_UPDATE_TOAST_MESSAGE)).toBeInTheDocument();
    expect(document.body.textContent).toMatch(
      /Or press (Mod|Ctrl)\+R to refresh\./i,
    );
    expect(screen.getByRole("note")).toHaveTextContent(/Esc/i);
  });
});

describe("showAppUpdateAvailableToast", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    mocks.toast.mockClear();
    reloadLocation.mockClear();
    registerToastPort(port);
  });

  it("shows once per version under a stable toast id", () => {
    mocks.isActive.mockImplementation(() => mocks.toast.mock.calls.length > 0);

    showAppUpdateAvailableToast("1.0.1");
    showAppUpdateAvailableToast("1.0.1");

    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect((mocks.toast.mock.calls[0] as unknown[])[1]).toMatchObject({
      toastId: "app-update-1.0.1",
      autoClose: false,
      closeOnClick: true,
    });
  });

  it("reloads when the toast surface is clicked", () => {
    showAppUpdateAvailableToast("1.0.1");
    const options = (mocks.toast.mock.calls[0] as unknown[])[1] as {
      onClick: () => void;
    };

    options.onClick();
    expect(reloadLocation).toHaveBeenCalledTimes(1);
  });
});
