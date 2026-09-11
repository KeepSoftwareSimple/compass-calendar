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
import { routeTree } from "@web/routers/router.routes";
import { describe, expect, it } from "bun:test";

const reservationId = "000000000000000000000099";
const cancelPath = `/meet/cancel/${reservationId}?token=abc`;
const slotStart = "2026-09-15T15:00:00.000Z";

function reservationGetHandler(overrides: Record<string, unknown> = {}) {
  return http.get(
    `${ENV_WEB.API_BASEURL}/booking/reservations/${reservationId}`,
    () =>
      HttpResponse.json(
        {
          slotStart,
          guestTimeZone: "UTC",
          durationMinutes: 30,
          hostDisplayName: "Tyler Dane",
          status: "confirmed",
          bookingSlug: "tylerdane",
          guestName: "Guest User",
          notes: null,
          ...overrides,
        },
        { status: Status.OK },
      ),
  );
}

function renderCancelRoute(path: string) {
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

describe("PublicBookingCancelPage", () => {
  it("does not POST until the guest confirms", async () => {
    const user = userEvent.setup({ delay: null });
    let cancelPosts = 0;

    server.use(
      reservationGetHandler(),
      http.post(
        `${ENV_WEB.API_BASEURL}/booking/reservations/${reservationId}/cancel`,
        async () => {
          cancelPosts += 1;
          return HttpResponse.json({ ok: true }, { status: Status.OK });
        },
      ),
    );

    renderCancelRoute(cancelPath);

    expect(
      await screen.findByRole("heading", { name: "Cancel this meeting?" }),
    ).toBeInTheDocument();
    expect(cancelPosts).toBe(0);

    await user.click(
      screen.getByRole("button", { name: "Cancel this meeting" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Meeting canceled" }),
    ).toBeInTheDocument();
    expect(cancelPosts).toBe(1);
  });

  it("does not POST twice if confirm is clicked while canceling", async () => {
    const user = userEvent.setup({ delay: null });
    let cancelPosts = 0;
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    server.use(
      reservationGetHandler(),
      http.post(
        `${ENV_WEB.API_BASEURL}/booking/reservations/${reservationId}/cancel`,
        async ({ request }) => {
          cancelPosts += 1;
          await hold;
          return HttpResponse.json({ ok: true }, { status: Status.OK });
        },
      ),
    );

    renderCancelRoute(cancelPath);

    await user.click(
      await screen.findByRole("button", { name: "Cancel this meeting" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Canceling..." }),
    );
    expect(cancelPosts).toBe(1);
    release();
    expect(
      await screen.findByRole("heading", { name: "Meeting canceled" }),
    ).toBeInTheDocument();
  });

  it("focuses the heading on load and tabs to the confirm button", async () => {
    const user = userEvent.setup({ delay: null });
    server.use(reservationGetHandler());

    renderCancelRoute(cancelPath);

    const heading = await screen.findByRole("heading", {
      name: "Cancel this meeting?",
    });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });

    await user.tab();
    expect(
      screen.getByRole("button", { name: "Cancel this meeting" }),
    ).toHaveFocus();
  });

  it("shows a distinct error heading from the canceled state", async () => {
    const user = userEvent.setup({ delay: null });

    server.use(
      reservationGetHandler(),
      http.post(
        `${ENV_WEB.API_BASEURL}/booking/reservations/${reservationId}/cancel`,
        () => HttpResponse.json({}, { status: Status.INTERNAL_SERVER }),
      ),
    );

    renderCancelRoute(cancelPath);

    await user.click(
      await screen.findByRole("button", { name: "Cancel this meeting" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Could not cancel meeting" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Meeting canceled" }),
    ).not.toBeInTheDocument();
  });

  it("shows not-found without posting when the token is missing", async () => {
    let cancelPosts = 0;
    server.use(
      reservationGetHandler(),
      http.post(
        `${ENV_WEB.API_BASEURL}/booking/reservations/${reservationId}/cancel`,
        () => {
          cancelPosts += 1;
          return HttpResponse.json({ ok: true }, { status: Status.OK });
        },
      ),
    );

    renderCancelRoute(`/meet/cancel/${reservationId}`);

    expect(
      await screen.findByRole("heading", { name: "Meeting not found" }),
    ).toBeInTheDocument();
    expect(cancelPosts).toBe(0);
  });

  it("shows host and slot details before confirm", async () => {
    server.use(reservationGetHandler());

    renderCancelRoute(cancelPath);

    expect(
      await screen.findByRole("heading", { name: "Cancel this meeting?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You are canceling a meeting with Tyler Dane."),
    ).toBeInTheDocument();
    expect(screen.getByText("When")).toBeInTheDocument();
    expect(screen.getByText("Duration")).toBeInTheDocument();
    expect(screen.getByText("Timezone")).toBeInTheDocument();
    expect(screen.getByText("30 minutes")).toBeInTheDocument();
  });

  it("skips confirmation when the reservation is already cancelled", async () => {
    let cancelPosts = 0;
    server.use(
      reservationGetHandler({ status: "cancelled" }),
      http.post(
        `${ENV_WEB.API_BASEURL}/booking/reservations/${reservationId}/cancel`,
        () => {
          cancelPosts += 1;
          return HttpResponse.json({ ok: true }, { status: Status.OK });
        },
      ),
    );

    renderCancelRoute(cancelPath);

    expect(
      await screen.findByRole("heading", { name: "Meeting canceled" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel this meeting" }),
    ).not.toBeInTheDocument();
    expect(cancelPosts).toBe(0);
  });

  it("returns to the confirmation page on Escape without posting", async () => {
    const user = userEvent.setup({ delay: null });
    let cancelPosts = 0;
    server.use(
      reservationGetHandler(),
      http.post(
        `${ENV_WEB.API_BASEURL}/booking/reservations/${reservationId}/cancel`,
        () => {
          cancelPosts += 1;
          return HttpResponse.json({ ok: true }, { status: Status.OK });
        },
      ),
    );

    const { router } = renderCancelRoute(cancelPath);

    expect(
      await screen.findByRole("heading", { name: "Cancel this meeting?" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(
      await screen.findByRole("heading", {
        name: "You're meeting with Tyler Dane",
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      `/meet/confirmed/${reservationId}`,
    );
    expect(router.state.location.search).toEqual({ token: "abc" });
    expect(
      screen.getByRole("link", { name: "Cancel this meeting" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit details" }),
    ).toBeInTheDocument();
    expect(cancelPosts).toBe(0);
  });

  it("does not navigate or abort when Escape is pressed during cancel POST", async () => {
    const user = userEvent.setup({ delay: null });
    let cancelPosts = 0;
    let release!: () => void;
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    server.use(
      reservationGetHandler(),
      http.post(
        `${ENV_WEB.API_BASEURL}/booking/reservations/${reservationId}/cancel`,
        async ({ request }) => {
          cancelPosts += 1;
          await hold;
          return HttpResponse.json({ ok: true }, { status: Status.OK });
        },
      ),
    );

    const { router } = renderCancelRoute(cancelPath);

    await user.click(
      await screen.findByRole("button", { name: "Cancel this meeting" }),
    );
    expect(
      await screen.findByRole("button", { name: "Canceling..." }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(
      screen.getByRole("heading", { name: "Cancel this meeting?" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      `/meet/cancel/${reservationId}`,
    );
    expect(cancelPosts).toBe(1);

    release();
    expect(
      await screen.findByRole("heading", { name: "Meeting canceled" }),
    ).toBeInTheDocument();
    expect(cancelPosts).toBe(1);
  });

  it("does not navigate on Escape from the not-found heading", async () => {
    const user = userEvent.setup({ delay: null });
    const { router } = renderCancelRoute(`/meet/cancel/${reservationId}`);

    const heading = await screen.findByRole("heading", {
      name: "Meeting not found",
    });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    await user.keyboard("{Escape}");

    expect(
      screen.getByRole("heading", { name: "Meeting not found" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(
      `/meet/cancel/${reservationId}`,
    );
  });

  it("offers Retry after a failed cancel and sends a second POST", async () => {
    const user = userEvent.setup({ delay: null });
    const tokens: string[] = [];
    let failNext = true;

    server.use(
      reservationGetHandler(),
      http.post(
        `${ENV_WEB.API_BASEURL}/booking/reservations/${reservationId}/cancel`,
        async ({ request }) => {
          const body = (await request.json()) as { token?: string };
          tokens.push(body.token ?? "");
          if (failNext) {
            failNext = false;
            return HttpResponse.json({}, { status: Status.INTERNAL_SERVER });
          }
          return HttpResponse.json({ ok: true }, { status: Status.OK });
        },
      ),
    );

    renderCancelRoute(cancelPath);
    await user.click(
      await screen.findByRole("button", { name: "Cancel this meeting" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Could not cancel meeting" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("heading", { name: "Cancel this meeting?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("When")).toBeInTheDocument();
    expect(screen.getByText("Duration")).toBeInTheDocument();
    expect(screen.getByText("Timezone")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Cancel this meeting" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Meeting canceled" }),
    ).toBeInTheDocument();
    expect(tokens).toEqual(["abc", "abc"]);
  });

  it("does not offer Retry after a 404 cancel", async () => {
    const user = userEvent.setup({ delay: null });
    let cancelPosts = 0;
    server.use(
      reservationGetHandler(),
      http.post(
        `${ENV_WEB.API_BASEURL}/booking/reservations/${reservationId}/cancel`,
        () => {
          cancelPosts += 1;
          return HttpResponse.json({}, { status: Status.NOT_FOUND });
        },
      ),
    );

    renderCancelRoute(cancelPath);
    await user.click(
      await screen.findByRole("button", { name: "Cancel this meeting" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Meeting not found" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
    expect(cancelPosts).toBe(1);
  });

  it("links Meet another time after cancel when bookingSlug is present", async () => {
    const user = userEvent.setup({ delay: null });
    server.use(
      reservationGetHandler(),
      http.post(
        `${ENV_WEB.API_BASEURL}/booking/reservations/${reservationId}/cancel`,
        () => HttpResponse.json({ ok: true }, { status: Status.OK }),
      ),
    );

    renderCancelRoute(cancelPath);
    await user.click(
      await screen.findByRole("button", { name: "Cancel this meeting" }),
    );
    const rebook = await screen.findByRole("link", {
      name: "Meet another time",
    });
    expect(rebook).toHaveAttribute("href", "/meet/tylerdane");
    expect(rebook.getAttribute("href")).not.toContain("token");
  });

  it("shows Meet another time on an already-cancelled reservation", async () => {
    server.use(reservationGetHandler({ status: "cancelled" }));

    renderCancelRoute(cancelPath);

    expect(
      await screen.findByRole("heading", { name: "Meeting canceled" }),
    ).toBeInTheDocument();
    const rebook = screen.getByRole("link", { name: "Meet another time" });
    expect(rebook).toHaveAttribute("href", "/meet/tylerdane");
    expect(rebook.getAttribute("href")).not.toContain("token");
    expect(rebook.getAttribute("href")).not.toContain(reservationId);
  });

  it("hides Meet another time when bookingSlug is missing", async () => {
    server.use(
      http.get(
        `${ENV_WEB.API_BASEURL}/booking/reservations/${reservationId}`,
        () =>
          HttpResponse.json(
            {
              slotStart,
              guestTimeZone: "UTC",
              durationMinutes: 30,
              hostDisplayName: "Tyler Dane",
              status: "cancelled",
              guestName: "Guest User",
              notes: null,
            },
            { status: Status.OK },
          ),
      ),
    );

    renderCancelRoute(cancelPath);

    expect(
      await screen.findByRole("heading", { name: "Meeting canceled" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Meet another time" }),
    ).not.toBeInTheDocument();
  });
});
