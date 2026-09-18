import { HotkeysProvider } from "@tanstack/react-hotkeys";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Status } from "@core/errors/status.codes";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { rest } from "@web/__tests__/helpers/msw-rest";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { formatBookingSlotTime } from "@web/booking/public-booking.format";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { routeTree } from "@web/routers/router.routes";
import { describe, expect, it } from "bun:test";

const reservationId = "000000000000000000000099";
const reschedulePath = `/meet/reschedule/${reservationId}?token=abc`;
const slotStart = (() => {
  const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
  start.setUTCMinutes(0, 0, 0);
  start.setUTCHours(15, 0, 0, 0);
  return start.toISOString();
})();
const slotEnd = new Date(Date.parse(slotStart) + 30 * 60 * 1000).toISOString();

function reservationGetHandler(overrides: Record<string, unknown> = {}) {
  return rest.get(
    `${ENV_WEB.API_BASEURL}/booking/reservations/${reservationId}`,
    (_req, res, ctx) =>
      res(
        ctx.status(Status.OK),
        ctx.json({
          slotStart,
          guestTimeZone: "UTC",
          durationMinutes: 30,
          hostDisplayName: "Tyler Dane",
          status: "confirmed",
          bookingSlug: "tylerdane",
          guestName: "Guest User",
          notes: null,
          ...overrides,
        }),
      ),
  );
}

function pageHandler() {
  return rest.get(
    `${ENV_WEB.API_BASEURL}/booking/pages/tylerdane`,
    (_req, res, ctx) =>
      res(
        ctx.status(Status.OK),
        ctx.json({
          hostDisplayName: "Tyler Dane",
          durationMinutes: 30,
          timeZone: "America/Chicago",
          enabled: true,
          maxHorizonDays: 60,
        }),
      ),
  );
}

function reservationSlotsHandler(
  onRequest?: (url: URL) => void,
  slots = [{ slotStart, slotEnd }],
) {
  return rest.get(
    `${ENV_WEB.API_BASEURL}/booking/reservations/${reservationId}/slots`,
    (req, res, ctx) => {
      onRequest?.(req.url);
      return res(ctx.status(Status.OK), ctx.json({ bookable: true, slots }));
    },
  );
}

function renderRescheduleRoute(path: string) {
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

describe("PublicBookingReschedulePage", () => {
  it("does not POST on load and sends one POST on Confirm", async () => {
    const user = userEvent.setup({ delay: null });
    const posts: unknown[] = [];

    server.use(
      reservationGetHandler(),
      pageHandler(),
      reservationSlotsHandler(),
      rest.post(
        `${ENV_WEB.API_BASEURL}/booking/reservations/${reservationId}/reschedule`,
        async (req, res, ctx) => {
          posts.push(await req.json());
          return res(
            ctx.status(Status.OK),
            ctx.json({
              reservationId,
              slotStart,
              slotEnd,
              guestTimeZone: "UTC",
              durationMinutes: 30,
              hostDisplayName: "Tyler Dane",
              status: "confirmed",
              bookingSlug: "tylerdane",
            }),
          );
        },
      ),
    );

    const { router } = renderRescheduleRoute(reschedulePath);

    expect(
      await screen.findByRole("heading", {
        name: "Reschedule your meeting with Tyler Dane",
      }),
    ).toHaveFocus();
    expect(posts).toHaveLength(0);

    await user.click(
      await screen.findByRole("button", {
        name: formatBookingSlotTime(slotStart, "UTC"),
      }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => {
      expect(posts).toEqual([
        { token: "abc", slotStart, guestTimeZone: "UTC", durationMinutes: 30 },
      ]);
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        `/meet/confirmed/${reservationId}`,
      );
    });
    expect(router.state.location.state).toMatchObject({
      cancelUrl: `${window.location.origin}/meet/cancel/${reservationId}?token=abc`,
      rescheduleUrl: `${window.location.origin}/meet/reschedule/${reservationId}?token=abc`,
    });
  });

  it("does not POST twice if Confirm is clicked while in flight", async () => {
    const user = userEvent.setup({ delay: null });
    let posts = 0;
    let releasePost: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releasePost = resolve;
    });

    server.use(
      reservationGetHandler(),
      pageHandler(),
      reservationSlotsHandler(),
      rest.post(
        `${ENV_WEB.API_BASEURL}/booking/reservations/${reservationId}/reschedule`,
        async (_req, res, ctx) => {
          posts += 1;
          await gate;
          return res(
            ctx.status(Status.OK),
            ctx.json({
              reservationId,
              slotStart,
              slotEnd,
              guestTimeZone: "UTC",
              durationMinutes: 30,
              hostDisplayName: "Tyler Dane",
              status: "confirmed",
              bookingSlug: "tylerdane",
            }),
          );
        },
      ),
    );

    renderRescheduleRoute(reschedulePath);
    await user.click(
      await screen.findByRole("button", {
        name: formatBookingSlotTime(slotStart, "UTC"),
      }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await user.click(screen.getByRole("button", { name: "Confirming..." }));
    releasePost?.();

    await waitFor(() => {
      expect(posts).toBe(1);
    });
  });

  it("shows not-found without fetching slots when the token is missing", async () => {
    let slotGets = 0;
    server.use(
      reservationGetHandler(),
      pageHandler(),
      reservationSlotsHandler(() => {
        slotGets += 1;
      }),
    );

    renderRescheduleRoute(`/meet/reschedule/${reservationId}`);

    expect(
      await screen.findByRole("heading", { name: "Meeting not found" }),
    ).toHaveFocus();
    expect(slotGets).toBe(0);
    expect(
      screen.queryByRole("heading", {
        name: "Reschedule your meeting with Tyler Dane",
      }),
    ).not.toBeInTheDocument();
  });

  it("stays on the picker and focuses the alert on 409", async () => {
    const user = userEvent.setup({ delay: null });

    server.use(
      reservationGetHandler(),
      pageHandler(),
      reservationSlotsHandler(),
      rest.post(
        `${ENV_WEB.API_BASEURL}/booking/reservations/${reservationId}/reschedule`,
        (_req, res, ctx) => res(ctx.status(Status.CONFLICT), ctx.json({})),
      ),
    );

    const { router } = renderRescheduleRoute(reschedulePath);
    await user.click(
      await screen.findByRole("button", {
        name: formatBookingSlotTime(slotStart, "UTC"),
      }),
    );
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByRole("alert")).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This time is no longer available. Pick another slot.",
    );
    expect(
      screen.getByRole("heading", {
        name: "Reschedule your meeting with Tyler Dane",
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      `/meet/reschedule/${reservationId}`,
    );
  });

  it("shows a calm canceled heading instead of the picker", async () => {
    let slotGets = 0;
    server.use(
      reservationGetHandler({ status: "cancelled" }),
      pageHandler(),
      reservationSlotsHandler(() => {
        slotGets += 1;
      }),
    );

    renderRescheduleRoute(reschedulePath);

    expect(
      await screen.findByRole("heading", {
        name: "This meeting was canceled",
      }),
    ).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Confirm" }),
    ).not.toBeInTheDocument();
    expect(slotGets).toBe(0);
  });
});
