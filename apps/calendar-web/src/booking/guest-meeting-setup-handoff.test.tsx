import "@testing-library/jest-dom";
import { HotkeysProvider, resolveModifier } from "@tanstack/react-hotkeys";
import { RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import { createTestRouter } from "@web/__tests__/utils/providers/createTestRouter";
import { UpgradeConfirmationProvider } from "@web/billing/UpgradeConfirmation/UpgradeConfirmationProvider";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { AuthModal } from "@web/components/AuthModal/AuthModal";
import { AuthModalProvider } from "@web/components/AuthModal/AuthModalProvider";
import { SettingsModal } from "@web/components/Settings/SettingsModal";
import {
  selectIsSettingsOpen,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";
import { afterEach, describe, expect, it, mock } from "bun:test";

const actualUseSession = (await import("@web/auth/compass/session/useSession"))
  .useSession;
let sessionAuthenticated = false;
mock.module("@web/auth/compass/session/useSession", () => ({
  useSession: (..._args: Parameters<typeof actualUseSession>) => ({
    authenticated: sessionAuthenticated,
    setAuthenticated: mock(),
  }),
}));

const mockTrackSignupStarted = mock();
const actualSignupFunnel = await import("@web/auth/posthog/signup-funnel");
mock.module("@web/auth/posthog/signup-funnel", () => ({
  ...actualSignupFunnel,
  trackSignupStarted: (
    ...args: Parameters<typeof actualSignupFunnel.trackSignupStarted>
  ) => mockTrackSignupStarted(...args),
}));

const realRouters = await import("@web/routers");
type HandoffNavigateRouter = Pick<typeof realRouters.router, "navigate">;
let handoffTestRouter: HandoffNavigateRouter | null = null;
mock.module("@web/routers", () => ({
  ...realRouters,
  router: new Proxy(realRouters.router, {
    get(target, prop, receiver) {
      if (prop === "navigate" && handoffTestRouter != null) {
        return handoffTestRouter.navigate.bind(handoffTestRouter);
      }
      return Reflect.get(target, prop, receiver);
    },
  }),
}));

const writableCalendar = createMockCalendar({
  id: CalendarIdSchema.parse(createObjectIdString()),
  name: "Work",
  accountEmail: "guest@example.com",
});

async function renderGuestHandoff() {
  const { queryClient, wrapper } = createStoreWrapper();
  queryClient.setQueryData(calendarQueryKeys.all, [writableCalendar]);
  settingsActions.beginGuestMeetingSetup();
  const router = createTestRouter(
    <AuthModalProvider>
      <HotkeysProvider>
        <UpgradeConfirmationProvider>
          <SettingsModal />
          <AuthModal />
        </UpgradeConfirmationProvider>
      </HotkeysProvider>
    </AuthModalProvider>,
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />, { wrapper });
  await waitFor(() => {
    expect(router.state.status).toBe("idle");
  });
  handoffTestRouter = router;
  return { router, user: userEvent.setup({ delay: null }) };
}

async function advanceGuestToGoLive(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Page address"), "my-meetings");
  await user.click(await screen.findByRole("button", { name: /^Continue/ }));
  await user.click(screen.getByRole("button", { name: /^Continue/ }));
  await user.click(screen.getByRole("button", { name: /^Continue/ }));
  return screen.findByRole("button", { name: /Sign up to go live/ });
}

describe("guest meeting setup sign-up handoff", () => {
  afterEach(() => {
    sessionAuthenticated = false;
    mockTrackSignupStarted.mockClear();
    handoffTestRouter = null;
    settingsActions.closeSettings();
  });

  it("closes Settings and focuses the sign-up email field", async () => {
    const { router, user } = await renderGuestHandoff();
    const goLive = await advanceGuestToGoLive(user);
    await user.click(goLive);

    await waitFor(() => {
      expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(false);
    });
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ auth: "signup" });
    });
    const email = await screen.findByLabelText("Email");
    await waitFor(() => {
      expect(email).toHaveFocus();
    });
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
  });

  it("handles Mod+Enter once without duplicate signup tracking", async () => {
    const { user } = await renderGuestHandoff();
    const goLive = await advanceGuestToGoLive(user);
    goLive.focus();
    const modKey = resolveModifier("Mod") === "Meta" ? "{Meta>}" : "{Control>}";
    await user.keyboard(`${modKey}{Enter}{/Meta}{/Control}`);
    await waitFor(() => {
      expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(false);
    });
    expect(mockTrackSignupStarted).toHaveBeenCalledTimes(1);
    await user.keyboard(`${modKey}{Enter}{/Meta}{/Control}`);
    expect(mockTrackSignupStarted).toHaveBeenCalledTimes(1);
  });
});
