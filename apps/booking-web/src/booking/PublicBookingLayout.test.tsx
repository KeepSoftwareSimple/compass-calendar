import { PublicBookingLayout } from "@booking-web/booking/PublicBookingLayout";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "bun:test";

describe("PublicBookingLayout", () => {
  it("keeps the public booking page inside the viewport and scrolls main", () => {
    render(
      <PublicBookingLayout>
        <p>Booking content</p>
      </PublicBookingLayout>,
    );

    const main = screen.getByRole("main");
    expect(main).toHaveTextContent("Booking content");
    expect(main.parentElement).toHaveAttribute("data-document-scroll");
    expect(main.parentElement?.className).toContain("h-dvh");
    expect(main.parentElement?.className).toContain("overflow-hidden");
    expect(main.className).toContain("overflow-y-auto");
    expect(main.className).toContain("max-w-lg");
  });

  it("widens the two-pane picker page", () => {
    render(
      <PublicBookingLayout wide>
        <p>Picker</p>
      </PublicBookingLayout>,
    );

    expect(screen.getByRole("main").className).toContain("max-w-3xl");
  });

  it("links back to Compass from the footer", () => {
    render(
      <PublicBookingLayout>
        <p>Booking content</p>
      </PublicBookingLayout>,
    );

    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent(
      "Compass Calendar · Your calendar and meeting pages in one app.",
    );
    expect(
      within(footer).getByRole("link", { name: "Open Compass →" }),
    ).toHaveAttribute("href", "/");
  });
});
