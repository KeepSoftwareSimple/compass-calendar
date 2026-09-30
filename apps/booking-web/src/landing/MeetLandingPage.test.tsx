import { routeTree } from "@booking-web/routers/router.routes";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";

const mockTrack = mock();
const actualTrack = { ...(await import("@web/auth/posthog/track")) };
let isTrackMocked = true;
mock.module("@web/auth/posthog/track", () => ({
  ...actualTrack,
  track: (...args: Parameters<typeof actualTrack.track>) =>
    isTrackMocked ? mockTrack(...args) : actualTrack.track(...args),
}));

afterAll(() => {
  isTrackMocked = false;
});

afterEach(() => {
  mockTrack.mockClear();
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

const HEADING = "Let people book time with you";

describe("MeetLandingPage", () => {
  it("renders the landing page on bare /meet with one page shell", async () => {
    const { rerender } = renderBookingRoute("/meet");

    expect(
      await screen.findByRole("heading", { level: 1, name: HEADING }),
    ).toBeInTheDocument();
    expect(document.title).toBe("Meeting pages - Compass");
    expect(
      screen.getByRole("heading", { level: 2, name: "How it works" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);

    expect(
      mockTrack.mock.calls.filter(
        (call) => call[0] === "booking_landing_viewed",
      ),
    ).toHaveLength(1);
    rerender(<div />);
    expect(
      mockTrack.mock.calls.filter(
        (call) => call[0] === "booking_landing_viewed",
      ),
    ).toHaveLength(1);
  });

  it("renders the landing page on /meet/ too", async () => {
    renderBookingRoute("/meet/");

    expect(
      await screen.findByRole("heading", { level: 1, name: HEADING }),
    ).toBeInTheDocument();
  });

  it("sends every setup link to the guest meeting setup with its source", async () => {
    renderBookingRoute("/meet");
    await screen.findByRole("heading", { level: 1, name: HEADING });

    const cta = screen.getByRole("link", { name: "Set up your meeting page" });
    expect(cta).toHaveAttribute("href", "/?meetingSetup=1");
    fireEvent.click(cta);
    expect(mockTrack).toHaveBeenCalledWith("booking_setup_cta_clicked", {
      source: "landing",
    });

    const settingsLink = screen.getByRole("link", {
      name: "opens Meeting settings",
    });
    expect(settingsLink).toHaveAttribute("href", "/?meetingSetup=1");

    mockTrack.mockClear();
    const footerLink = screen.getByRole("link", {
      name: "Set up your own meeting page",
    });
    expect(footerLink).toHaveAttribute("href", "/?meetingSetup=1");
    fireEvent.click(footerLink);
    expect(mockTrack).toHaveBeenCalledWith("booking_setup_cta_clicked", {
      source: "footer",
    });
  });
});
