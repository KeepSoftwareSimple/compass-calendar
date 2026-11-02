import {
  pageHandler,
  reservationGetHandler,
} from "@booking-web/__tests__/public-booking.msw";
import { formatBookingSlotTime } from "@booking-web/booking/public-booking.format";
import { releasePublicBookingPageHeadingFocus } from "@booking-web/booking/use-booking-heading-focus";
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

afterEach(() => {
  releasePublicBookingPageHeadingFocus();
});

const MEETING_TYPES = [
  { id: "default", label: "Quick chat", durationMinutes: 30 },
  { id: "type-deep", label: "Deep dive", durationMinutes: 60 },
  { id: "type-short", label: "Check-in", durationMinutes: 15 },
];

/** A future slot this UTC month; the page is pinned to `?tz=UTC`. */
function futureSlot() {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  start.setUTCSeconds(0, 0);
  if (start.getUTCMonth() !== now.getUTCMonth()) {
    start.setTime(now.getTime() + 60 * 1000);
    start.setUTCSeconds(0, 0);
  }
  return {
    slotStart: start.toISOString(),
    slotEnd: new Date(start.getTime() + 30 * 60 * 1000).toISOString(),
  };
}

const slot = futureSlot();

function renderBookingRoute(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    defaultPendingMs: 0,
  });
  const { wrapper } = createStoreWrapper();
  const result = render(
    <HotkeysProvider>
      <RouterProvider router={router} />
    </HotkeysProvider>,
    { wrapper },
  );
  return { ...result, router };
}

function slotsHandler(seenTypeIds: Array<string | null>) {
  return http.get(
    `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/slots`,
    ({ request }) => {
      seenTypeIds.push(new URL(request.url).searchParams.get("meetingTypeId"));
      return HttpResponse.json(
        { bookable: true, slots: [slot] },
        { status: Status.OK },
      );
    },
  );
}

function multiTypePage() {
  return pageHandler({ meetingTypes: MEETING_TYPES });
}

describe("PublicBookingPage meeting types", () => {
  it("hides the picker and sends no type id on a one-type page", async () => {
    const seen: Array<string | null> = [];
    server.use(pageHandler(), slotsHandler(seen));
    renderBookingRoute("/meet/tylerdane?tz=UTC");

    expect(
      await screen.findByRole("heading", { name: "Pick a time" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Pick a meeting" }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen.every((id) => id === null)).toBe(true);
  });

  it("opens the type from ?type= and asks for its slots", async () => {
    const seen: Array<string | null> = [];
    server.use(multiTypePage(), slotsHandler(seen));
    renderBookingRoute("/meet/tylerdane?tz=UTC&type=type-deep");

    expect(
      await screen.findByRole("button", { name: /Deep dive/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 hour Google Meet")).toBeInTheDocument();
    await waitFor(() => expect(seen).toContain("type-deep"));
  });

  it("falls back to type #1 when ?type= is unknown", async () => {
    const seen: Array<string | null> = [];
    server.use(multiTypePage(), slotsHandler(seen));
    renderBookingRoute("/meet/tylerdane?tz=UTC&type=gone");

    expect(
      await screen.findByRole("button", { name: /Quick chat/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("30 minutes Google Meet")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("button")
        .filter((el) => el.hasAttribute("data-meeting-type")),
    ).toHaveLength(3);
  });

  it("switches type with 1, 2 and 3 and keeps type #1 links short", async () => {
    const user = userEvent.setup({ delay: null });
    const seen: Array<string | null> = [];
    server.use(multiTypePage(), slotsHandler(seen));
    const { router } = renderBookingRoute("/meet/tylerdane?tz=UTC");

    expect(
      await screen.findByRole("button", { name: /Quick chat/ }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.keyboard("3");
    expect(screen.getByRole("button", { name: /Check-in/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(router.state.location.search).toMatchObject({ type: "type-short" });
    expect(screen.getByText("15 minutes Google Meet")).toBeInTheDocument();
    await waitFor(() => expect(seen).toContain("type-short"));

    await user.keyboard("1");
    expect(screen.getByRole("button", { name: /Quick chat/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(router.state.location.search).not.toHaveProperty("type");
  });

  it("books the picked type with its id and length", async () => {
    const user = userEvent.setup({ delay: null });
    let postedBody: unknown;
    server.use(
      multiTypePage(),
      slotsHandler([]),
      reservationGetHandler(slot.slotStart),
      http.post(
        `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane/reservations`,
        async ({ request }) => {
          postedBody = await request.json();
          return HttpResponse.json(
            {
              reservationId: "000000000000000000000099",
              slotStart: slot.slotStart,
              slotEnd: slot.slotEnd,
              guestTimeZone: "UTC",
              cancelUrl:
                "https://compasscalendar.com/meet/cancel/000000000000000000000099?token=abc",
              rescheduleUrl:
                "https://compasscalendar.com/meet/reschedule/000000000000000000000099?token=abc",
            },
            { status: Status.OK },
          );
        },
      ),
    );
    renderBookingRoute("/meet/tylerdane?tz=UTC");

    await user.click(await screen.findByRole("button", { name: /Deep dive/ }));
    await user.click(
      await screen.findByRole("button", {
        name: formatBookingSlotTime(slot.slotStart, "UTC"),
      }),
    );
    expect(
      screen.queryByRole("heading", { name: "Pick a meeting" }),
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "Guest User");
    await user.type(screen.getByLabelText("Email"), "guest@example.com");
    await user.click(screen.getByRole("button", { name: "Confirm meeting" }));

    await waitFor(() =>
      expect(postedBody).toMatchObject({
        slotStart: slot.slotStart,
        durationMinutes: 60,
        meetingTypeId: "type-deep",
      }),
    );
  });
});
