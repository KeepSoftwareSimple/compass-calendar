import { pageHandler } from "@booking-web/__tests__/public-booking.msw";
import { routeTree } from "@booking-web/routers/router.routes";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Status } from "@core/errors/status.codes";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { afterEach, describe, expect, it } from "bun:test";

const ownerUpcomingUrl = `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/owner/upcoming`;
const ownerCancelUrl = (id: string) =>
  `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/owner/reservations/${id}/cancel`;

function renderMeetPage() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/meet/tylerdane"] }),
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

const upcomingBookings = [
  {
    reservationId: "507f1f77bcf86cd799439011",
    guestName: "Ada Lovelace",
    guestEmail: "ada@example.com",
    slotStart: "2026-10-31T13:00:00.000Z",
    slotEnd: "2026-10-31T13:30:00.000Z",
    durationMinutes: 30,
    meetLink: "https://meet.google.com/abc-defg-hij",
  },
  {
    reservationId: "507f1f77bcf86cd799439012",
    guestName: "Grace Hopper",
    guestEmail: "grace@example.com",
    slotStart: "2026-11-01T20:00:00.000Z",
    slotEnd: "2026-11-01T20:45:00.000Z",
    durationMinutes: 45,
    meetLink: null,
  },
];

describe("PublicBookingOwnerInbox", () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it("hides the inbox for guests without a session", async () => {
    server.use(
      pageHandler(),
      http.get(ownerUpcomingUrl, () =>
        HttpResponse.json({}, { status: Status.UNAUTHORIZED }),
      ),
      http.get(`${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/slots`, () =>
        HttpResponse.json({ slots: [], bookable: true }, { status: Status.OK }),
      ),
    );
    renderMeetPage();
    await screen.findByRole("heading", { name: "Meet with Tyler Dane" });
    expect(
      screen.queryByRole("heading", { name: "Your upcoming bookings" }),
    ).not.toBeInTheDocument();
  });

  it("shows an empty state for the signed-in owner", async () => {
    server.use(
      pageHandler(),
      http.get(ownerUpcomingUrl, () =>
        HttpResponse.json({ reservations: [] }, { status: Status.OK }),
      ),
      http.get(`${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/slots`, () =>
        HttpResponse.json({ slots: [], bookable: true }, { status: Status.OK }),
      ),
    );
    renderMeetPage();
    expect(
      await screen.findByText("No upcoming bookings through this page yet."),
    ).toBeInTheDocument();
  });

  it("lists upcoming bookings and cancels after confirmation", async () => {
    const user = userEvent.setup({ delay: null });
    let cancelCalls = 0;

    server.use(
      pageHandler(),
      http.get(ownerUpcomingUrl, () =>
        HttpResponse.json(
          { reservations: upcomingBookings },
          { status: Status.OK },
        ),
      ),
      http.post(ownerCancelUrl(upcomingBookings[0]!.reservationId), () => {
        cancelCalls += 1;
        return HttpResponse.json({ ok: true }, { status: Status.OK });
      }),
      http.get(`${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/slots`, () =>
        HttpResponse.json({ slots: [], bookable: true }, { status: Status.OK }),
      ),
    );

    renderMeetPage();
    expect(
      await screen.findByRole("heading", { name: "Your upcoming bookings" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ada Lovelace · ada@example.com"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Grace Hopper · grace@example.com"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Oct 31.*30 min/)).toBeInTheDocument();
    expect(screen.getByText(/Nov 1.*45 min/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join meeting" })).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij",
    );

    await user.click(screen.getAllByRole("button", { name: "Cancel" })[0]!);
    expect(
      await screen.findByRole("alertdialog", {
        name: "Cancel this booking?",
      }),
    ).toBeInTheDocument();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(cancelCalls).toBe(1);
    });
  });

  it("dismisses cancel confirmation on Escape", async () => {
    const user = userEvent.setup({ delay: null });

    server.use(
      pageHandler(),
      http.get(ownerUpcomingUrl, () =>
        HttpResponse.json(
          { reservations: upcomingBookings },
          { status: Status.OK },
        ),
      ),
      http.get(`${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/slots`, () =>
        HttpResponse.json({ slots: [], bookable: true }, { status: Status.OK }),
      ),
    );

    renderMeetPage();
    await screen.findByText("Ada Lovelace · ada@example.com");
    await user.click(screen.getAllByRole("button", { name: "Cancel" })[0]!);
    await screen.findByRole("alertdialog", { name: "Cancel this booking?" });
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("alertdialog", { name: "Cancel this booking?" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Ada Lovelace · ada@example.com"),
    ).toBeInTheDocument();
  });
});
