import { releasePublicBookingPageHeadingFocus } from "@booking-web/booking/use-booking-heading-focus";
import { NotFoundView } from "@booking-web/views/NotFoundView";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "bun:test";

afterEach(() => {
  releasePublicBookingPageHeadingFocus();
});

describe("NotFoundView", () => {
  it("renders one page shell with the not-found copy", () => {
    render(<NotFoundView />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Page not found" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This link does not match a meeting page."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "See how meeting pages work" }),
    ).toHaveAttribute("href", "/meet");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(screen.getAllByRole("contentinfo")).toHaveLength(1);
  });
});
