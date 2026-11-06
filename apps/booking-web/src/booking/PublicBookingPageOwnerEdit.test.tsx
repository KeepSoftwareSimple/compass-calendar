import { pageHandler } from "@booking-web/__tests__/public-booking.msw";
import { routeTree } from "@booking-web/routers/router.routes";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { Status } from "@core/errors/status.codes";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { describe, expect, it } from "bun:test";

const ownerUpcomingUrl = `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/owner/upcoming`;
const hostPageUrl = `${ENV_WEB.API_BASEURL}/booking/page`;
const slotsUrl = `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/slots`;
const calendarId = "507f1f77bcf86cd799439011";
const hostPageId = "507f1f77bcf86cd799439012";

const savedHostPage = (weeklyAvailability: readonly unknown[]) => ({
  enabled: true,
  durationMinutes: 30,
  destinationCalendarId: calendarId,
  blockingCalendarIds: [calendarId],
  timeZone: "America/Chicago",
  weeklyAvailability,
  minNoticeHours: 4,
  maxHorizonDays: 60,
  id: hostPageId,
  slug: "tylerdane",
  hostUserId: calendarId,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  bookingUrl: "https://compasscalendar.com/meet/tylerdane",
});

function renderBookingRoute(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultPendingMs: 0,
  });
  const { wrapper } = createStoreWrapper();
  return render(
    <HotkeysProvider>
      <RouterProvider router={router} />
    </HotkeysProvider>,
    { wrapper },
  );
}

describe("meet page owner edit control", () => {
  it("hides Edit page for guests", async () => {
    server.use(
      pageHandler(),
      http.get(ownerUpcomingUrl, () =>
        HttpResponse.json({ message: "Unauthorized" }, { status: 401 }),
      ),
      http.get(slotsUrl, () =>
        HttpResponse.json({ bookable: true, slots: [] }, { status: Status.OK }),
      ),
    );

    renderBookingRoute("/meet/tylerdane");

    await screen.findByRole("heading", { name: "Meet with Tyler Dane" });
    await waitFor(() => {
      expect(
        screen.queryByRole("link", { name: /Edit page/i }),
      ).not.toBeInTheDocument();
    });
  });

  it("shows Edit page for the signed-in owner", async () => {
    server.use(
      pageHandler(),
      http.get(ownerUpcomingUrl, () =>
        HttpResponse.json({ reservations: [] }, { status: Status.OK }),
      ),
      http.get(hostPageUrl, () =>
        HttpResponse.json(savedHostPage([]), { status: Status.OK }),
      ),
      http.get(slotsUrl, () =>
        HttpResponse.json({ bookable: true, slots: [] }, { status: Status.OK }),
      ),
    );

    renderBookingRoute("/meet/tylerdane");
    const editLink = await screen.findByRole("link", { name: /Edit page/i });
    expect(editLink).toHaveAttribute("href", "/?meetingSetup=1");
  });

  it("shows owner copy when the page has no weekly booking hours", async () => {
    server.use(
      pageHandler(),
      http.get(ownerUpcomingUrl, () =>
        HttpResponse.json({ reservations: [] }, { status: Status.OK }),
      ),
      http.get(hostPageUrl, () =>
        HttpResponse.json(savedHostPage([]), { status: Status.OK }),
      ),
      http.get(slotsUrl, () =>
        HttpResponse.json({ bookable: true, slots: [] }, { status: Status.OK }),
      ),
    );

    renderBookingRoute("/meet/tylerdane");

    const alert = await screen.findByRole("alert");
    await waitFor(() => {
      expect(alert).toHaveTextContent("No booking hours set. Press E to edit.");
    });
  });
});
