import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { RouterProvider } from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { useState } from "react";
import {
  buildDefaultAdminPutInput,
  DEFAULT_WEEKLY_AVAILABILITY,
} from "@core/types/booking.contracts";
import { TimeZoneSchema } from "@core/types/domain-primitives";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import {
  createMockCalendar,
  createMockConnection,
} from "@web/__tests__/utils/factories/calendar.factory";
import { createTestRouter } from "@web/__tests__/utils/providers/createTestRouter";
import { SessionContext } from "@web/auth/compass/session/session.context";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import { BookingSettingsSection } from "@web/booking/BookingSettingsSection";
import { writeGuestMeetingSetupDraft } from "@web/booking/guest-meeting-setup.util";
import { useGuestMeetingSetupResume } from "@web/booking/useGuestMeetingSetupResume";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { ENV_WEB } from "@web/common/constants/env.constants";
import {
  selectGuestMeetingSetupActive,
  selectIsSettingsOpen,
  selectSettingsPage,
  settingsActions,
  useSettingsStore,
} from "@web/settings/settings.store";
import { afterEach, describe, expect, it } from "bun:test";

const bookingPageUrl = `${ENV_WEB.API_BASEURL}/booking/page`;

function ResumeProbe() {
  const [authenticated, setAuthenticated] = useState(false);
  useGuestMeetingSetupResume();
  return (
    <SessionContext.Provider value={{ authenticated, setAuthenticated }}>
      <button type="button" onClick={() => setAuthenticated(true)}>
        Sign in
      </button>
      <BookingSettingsSection />
    </SessionContext.Provider>
  );
}

describe("useGuestMeetingSetupResume", () => {
  afterEach(() => {
    settingsActions.closeSettings();
  });

  it("opens Meeting settings at go-live with the saved draft after sign-in", async () => {
    settingsActions.beginGuestMeetingSetup();
    const user = userEvent.setup({ delay: null });
    const writable = createMockCalendar({ name: "Work" });
    const draft = {
      ...buildDefaultAdminPutInput(TimeZoneSchema.parse("America/Chicago")),
      slug: "my-meetings",
      weeklyAvailability: DEFAULT_WEEKLY_AVAILABILITY,
    };
    writeGuestMeetingSetupDraft(draft);
    userMetadataActions.set({
      connections: [createMockConnection("host@example.com")],
    });
    server.use(
      http.get(bookingPageUrl, () =>
        HttpResponse.json({
          enabled: false,
          durationMinutes: 30,
          destinationCalendarId: writable.id,
          blockingCalendarIds: [writable.id],
          timeZone: "America/Chicago",
          weeklyAvailability: DEFAULT_WEEKLY_AVAILABILITY,
          minNoticeHours: 4,
          maxHorizonDays: 60,
          isConfigured: false,
          suggestedSlug: "hostuser",
        }),
      ),
    );

    const router = createTestRouter(
      <HotkeysProvider>
        <ResumeProbe />
      </HotkeysProvider>,
    );
    const { queryClient, wrapper: StoreWrapper } = createStoreWrapper();
    queryClient.setQueryData(calendarQueryKeys.all, [writable]);

    render(
      <StoreWrapper>
        <RouterProvider router={router} />
      </StoreWrapper>,
    );

    await waitFor(() => {
      expect(router.state.status).toBe("idle");
    });

    await user.click(await screen.findByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(true);
      expect(selectSettingsPage(useSettingsStore.getState())).toBe("booking");
      expect(selectGuestMeetingSetupActive(useSettingsStore.getState())).toBe(
        true,
      );
    });

    await waitFor(
      () => {
        expect(screen.getByText("Step 4 of 4")).toBeInTheDocument();
      },
      { timeout: 10_000 },
    );
    expect(
      screen.getByRole("button", { name: /Turn on and copy link/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Hours")).toBeInTheDocument();
  });
});
