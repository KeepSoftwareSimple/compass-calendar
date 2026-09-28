import { RouterProvider } from "@tanstack/react-router";
import { render, waitFor } from "@testing-library/react";
import { buildDefaultAdminPutInput } from "@core/types/booking.contracts";
import { TimeZoneSchema } from "@core/types/domain-primitives";
import { createTestRouter } from "@web/__tests__/utils/providers/createTestRouter";
import { SessionContext } from "@web/auth/compass/session/session.context";
import {
  clearGuestMeetingSetupDraft,
  writeGuestMeetingSetupDraft,
} from "@web/booking/guest-meeting-setup.util";
import { useGuestMeetingSetupResume } from "@web/booking/useGuestMeetingSetupResume";
import {
  selectIsSettingsOpen,
  selectSettingsPage,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";
import { afterEach, describe, expect, it } from "bun:test";

function Probe({ authenticated }: { authenticated: boolean }) {
  return (
    <SessionContext.Provider
      value={{
        authenticated,
        setAuthenticated: () => {},
      }}
    >
      <ResumeProbe />
    </SessionContext.Provider>
  );
}

function ResumeProbe() {
  useGuestMeetingSetupResume();
  return null;
}

async function renderResume(authenticated: boolean) {
  const router = createTestRouter(<Probe authenticated={authenticated} />, {
    initialEntries: ["/"],
  });
  render(<RouterProvider router={router} />);
  await waitFor(() => {
    expect(router.state.status).toBe("idle");
  });
  return router;
}

describe("useGuestMeetingSetupResume", () => {
  afterEach(() => {
    clearGuestMeetingSetupDraft();
    settingsActions.closeSettings();
  });

  it("opens Meeting settings when the session becomes authenticated with a saved draft", async () => {
    writeGuestMeetingSetupDraft(
      buildDefaultAdminPutInput(TimeZoneSchema.parse("America/Chicago")),
    );

    await renderResume(false);
    expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(false);

    await renderResume(true);

    await waitFor(() => {
      expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(true);
    });
    expect(selectSettingsPage(useSettingsStore.getState())).toBe("booking");
  });

  it("does nothing when there is no draft", async () => {
    await renderResume(true);
    expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(false);
  });
});
