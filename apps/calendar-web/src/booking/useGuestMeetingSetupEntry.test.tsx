import { RouterProvider } from "@tanstack/react-router";
import { render, waitFor } from "@testing-library/react";
import { createTestRouter } from "@web/__tests__/utils/providers/createTestRouter";
import { SessionContext } from "@web/auth/compass/session/session.context";
import { useGuestMeetingSetupEntry } from "@web/booking/useGuestMeetingSetupEntry";
import {
  selectGuestMeetingSetupActive,
  selectIsSettingsOpen,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";
import { afterEach, describe, expect, it } from "bun:test";

function Probe({ isMobile }: { isMobile: boolean }) {
  useGuestMeetingSetupEntry({ isMobile });
  return null;
}

async function renderEntry(isMobile: boolean) {
  const router = createTestRouter(
    <SessionContext.Provider
      value={{ authenticated: false, setAuthenticated: () => {} }}
    >
      <Probe isMobile={isMobile} />
    </SessionContext.Provider>,
    { initialEntries: ["/?meetingSetup=1"] },
  );
  render(<RouterProvider router={router} />);
  await waitFor(() => {
    expect(router.state.status).toBe("idle");
  });
  return router;
}

describe("useGuestMeetingSetupEntry", () => {
  afterEach(() => {
    settingsActions.closeSettings();
  });

  it("opens the guest wizard and consumes the flag on a computer", async () => {
    const router = await renderEntry(false);

    await waitFor(() => {
      expect(selectGuestMeetingSetupActive(useSettingsStore.getState())).toBe(
        true,
      );
    });
    expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(true);
    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
  });

  it("leaves the flag in the URL and Settings closed on a phone", async () => {
    const router = await renderEntry(true);

    // The wizard dead-ends at sign-up on a phone; RootView shows the desktop
    // handoff instead, and the flag must survive so the copied link opens
    // the wizard on a computer.
    expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(false);
    expect(selectGuestMeetingSetupActive(useSettingsStore.getState())).toBe(
      false,
    );
    expect(router.state.location.search).toEqual({ meetingSetup: 1 });
  });
});
