import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { rest } from "msw";
import { type PropsWithChildren } from "react";
import { DEFAULT_WEEKLY_AVAILABILITY } from "@core/types/booking.contracts";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { SessionContext } from "@web/auth/compass/session/session.context";
import { bookingQueryKeys } from "@web/booking/booking.query";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  initialFirstEventPromptState,
  useFirstEventPromptStore,
} from "@web/components/FirstEventPrompt/first-event.store";
import {
  selectIsSettingsOpen,
  selectSettingsPage,
  useSettingsStore,
} from "@web/settings/settings.store";
import { MeetingPageNudge } from "./MeetingPageNudge";
import { beforeEach, describe, expect, it } from "bun:test";

const bookingPageUrl = `${ENV_WEB.API_BASEURL}/booking/page`;

const savedOffPage = {
  id: "000000000000000000000001",
  slug: "hostuser",
  hostUserId: "000000000000000000000002",
  enabled: false,
  durationMinutes: 30,
  destinationCalendarId: "000000000000000000000001",
  blockingCalendarIds: ["000000000000000000000001"],
  timeZone: "UTC",
  weeklyAvailability: DEFAULT_WEEKLY_AVAILABILITY,
  minNoticeHours: 4,
  maxHorizonDays: 60,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  bookingUrl: "https://compasscalendar.com/meet/hostuser",
};

const livePage = { ...savedOffPage, enabled: true };

function renderNudge({
  authenticated = true,
  bookingEnabled,
  isMobile,
}: {
  authenticated?: boolean;
  bookingEnabled?: boolean;
  isMobile?: boolean;
} = {}) {
  const { wrapper: StoreWrapper, queryClient } = createStoreWrapper();

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <StoreWrapper>
        <SessionContext.Provider
          value={{ authenticated, setAuthenticated: () => {} }}
        >
          {children}
        </SessionContext.Provider>
      </StoreWrapper>
    );
  }

  return {
    queryClient,
    ...render(
      <MeetingPageNudge bookingEnabled={bookingEnabled} isMobile={isMobile} />,
      { wrapper: Wrapper },
    ),
  };
}

describe("MeetingPageNudge", () => {
  beforeEach(() => {
    useFirstEventPromptStore.setState(
      { ...initialFirstEventPromptState, isDone: true },
      true,
    );
  });

  it("renders for a signed-in user with no live page", async () => {
    server.use(
      rest.get(bookingPageUrl, (_req, res, ctx) => res(ctx.json(savedOffPage))),
    );
    renderNudge();

    expect(
      await screen.findByRole("heading", {
        name: "Let people book time with you",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Share a link and guests pick a time that is free on your calendar.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Set up meeting page" }),
    ).toBeTruthy();
  });

  it("opens Settings on the Meeting tab from Set up meeting page", async () => {
    server.use(
      rest.get(bookingPageUrl, (_req, res, ctx) => res(ctx.json(savedOffPage))),
    );
    const user = userEvent.setup({ delay: null });
    renderNudge();

    await user.click(
      await screen.findByRole("button", { name: "Set up meeting page" }),
    );

    expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(true);
    expect(selectSettingsPage(useSettingsStore.getState())).toBe("booking");
  });

  it("hides after Dismiss and sets the storage key", async () => {
    server.use(
      rest.get(bookingPageUrl, (_req, res, ctx) => res(ctx.json(savedOffPage))),
    );
    const user = userEvent.setup({ delay: null });
    renderNudge();

    await user.click(await screen.findByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("region", { name: "Meeting page" })).toBeNull();
    expect(
      persistentBrowserStore.get(STORAGE_KEYS.HAS_DISMISSED_MEETING_PAGE_NUDGE),
    ).toBe("true");
  });

  it("hides when the meeting page is live", async () => {
    server.use(
      rest.get(bookingPageUrl, (_req, res, ctx) => res(ctx.json(livePage))),
    );
    const { queryClient } = renderNudge();

    await waitFor(() => {
      expect(queryClient.getQueryData(bookingQueryKeys.page)).toMatchObject({
        enabled: true,
        bookingUrl: livePage.bookingUrl,
      });
    });
    expect(screen.queryByRole("region", { name: "Meeting page" })).toBeNull();
  });

  it("does not render when booking is disabled", async () => {
    renderNudge({ bookingEnabled: false });

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Meeting page" })).toBeNull();
    });
  });

  it("does not render for an anonymous user", async () => {
    renderNudge({ authenticated: false });

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Meeting page" })).toBeNull();
    });
  });

  it("does not render on mobile", async () => {
    renderNudge({ isMobile: true });

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Meeting page" })).toBeNull();
    });
  });
});
