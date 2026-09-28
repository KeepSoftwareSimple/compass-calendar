import "@testing-library/jest-dom";
import { HotkeysProvider, resolveModifier } from "@tanstack/react-hotkeys";
import { RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { buildDefaultAdminPutInput } from "@core/types/booking.contracts";
import { TimeZoneSchema } from "@core/types/domain-primitives";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { createTestRouter } from "@web/__tests__/utils/providers/createTestRouter";
import { SessionContext } from "@web/auth/compass/session/session.context";
import {
  clearGuestMeetingSetupDraft,
  writeGuestMeetingSetupDraft,
} from "@web/booking/guest-meeting-setup.util";
import { AuthModal } from "@web/components/AuthModal/AuthModal";
import { AuthModalProvider } from "@web/components/AuthModal/AuthModalProvider";
import { SettingsModal } from "@web/components/Settings/SettingsModal";
import {
  selectIsSettingsOpen,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const mockTrackSignupStartedAtClick = mock();
const actualSignupFunnel = await import("@web/auth/posthog/signup-funnel");
mockModuleForFile("@web/auth/posthog/signup-funnel", actualSignupFunnel, {
  trackSignupStartedAtClick: (
    ...args: Parameters<typeof actualSignupFunnel.trackSignupStartedAtClick>
  ) => mockTrackSignupStartedAtClick(...args),
});

let testRouter: ReturnType<typeof createTestRouter>;
const actualRouters = await import("@web/routers");
mockModuleForFile("@web/routers", actualRouters, {
  router: {
    navigate: (
      opts: Parameters<ReturnType<typeof createTestRouter>["navigate"]>[0],
    ) => {
      if (testRouter == null) {
        throw new Error("testRouter is not initialized");
      }
      return testRouter.navigate(opts);
    },
  },
});

const actualUseAppAccess = (await import("@web/billing/useAppAccess"))
  .useAppAccess;
mock.module("@web/billing/useAppAccess", () => ({
  useAppAccess: (...args: Parameters<typeof actualUseAppAccess>) =>
    actualUseAppAccess(...args),
}));

function GuestWizardShell() {
  return (
    <SessionContext.Provider
      value={{ authenticated: false, setAuthenticated: mock() }}
    >
      <AuthModalProvider>
        <SettingsModal />
        <AuthModal />
      </AuthModalProvider>
    </SessionContext.Provider>
  );
}

async function advanceGuestWizardToGoLive(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(await screen.findByRole("button", { name: /^Continue/ }));
  await user.click(screen.getByRole("button", { name: /^Continue/ }));
  await user.click(screen.getByRole("button", { name: /^Continue/ }));
  await screen.findByText("Step 4 of 4");
}

describe("BookingSettingsSection guest sign-up hand-off", () => {
  beforeEach(() => {
    mockTrackSignupStartedAtClick.mockClear();
    writeGuestMeetingSetupDraft({
      ...buildDefaultAdminPutInput(TimeZoneSchema.parse("UTC")),
      slug: "guest-host",
    });
    settingsActions.beginGuestMeetingSetup();
  });

  afterEach(() => {
    settingsActions.closeSettings();
    clearGuestMeetingSetupDraft();
  });

  it("closes Settings and opens sign-up from the go-live step", async () => {
    const user = userEvent.setup({ delay: null });
    testRouter = createTestRouter(
      <HotkeysProvider>
        <GuestWizardShell />
      </HotkeysProvider>,
    );
    const { wrapper } = createStoreWrapper();
    render(<RouterProvider router={testRouter} />, { wrapper });
    await waitFor(() => {
      expect(testRouter.state.status).toBe("idle");
    });

    await advanceGuestWizardToGoLive(user);
    expect(
      screen.getByRole("button", {
        name: "Start your free trial to publish your meeting page",
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Start your free trial to publish your meeting page",
      }),
    );

    await waitFor(() => {
      expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(false);
      expect(screen.getByLabelText(/email/i)).toHaveFocus();
    });
    expect(
      screen.getByRole("heading", { name: /nice to meet you/i }),
    ).toBeInTheDocument();
    expect(mockTrackSignupStartedAtClick).toHaveBeenCalledTimes(1);
    expect(mockTrackSignupStartedAtClick).toHaveBeenCalledWith(
      "meeting_page_setup",
    );
  });

  it("does not fire signup analytics twice when Mod+Enter is pressed again on go-live", async () => {
    const user = userEvent.setup({ delay: null });
    testRouter = createTestRouter(
      <HotkeysProvider>
        <GuestWizardShell />
      </HotkeysProvider>,
    );
    const { wrapper } = createStoreWrapper();
    render(<RouterProvider router={testRouter} />, { wrapper });
    await waitFor(() => {
      expect(testRouter.state.status).toBe("idle");
    });

    await advanceGuestWizardToGoLive(user);
    const modKey = resolveModifier("Mod") === "Meta" ? "Meta" : "Control";
    const goLive = screen.getByRole("button", {
      name: "Start your free trial to publish your meeting page",
    });
    goLive.focus();
    await user.keyboard(`{${modKey}}{Enter}`);
    await waitFor(() => {
      expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(false);
    });
    await user.keyboard(`{${modKey}}{Enter}`);
    expect(mockTrackSignupStartedAtClick).toHaveBeenCalledTimes(1);
  });
});
