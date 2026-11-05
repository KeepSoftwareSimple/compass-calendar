import { render, screen } from "@testing-library/react";
import { InlineSpinner } from "@web/components/InlineSpinner/InlineSpinner";
import { describe, expect, it } from "bun:test";

describe("InlineSpinner", () => {
  it("exposes a progressbar with its label", () => {
    render(<InlineSpinner label="Searching events" />);

    expect(
      screen.getByRole("progressbar", { name: "Searching events" }),
    ).toBeInTheDocument();
  });

  it("stays decorative without a label", () => {
    const { container } = render(<InlineSpinner ring="subtle" size="sm" />);

    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("holds still under reduced motion", () => {
    const { container } = render(<InlineSpinner label="Loading" />);

    expect(container.firstElementChild?.className).toContain(
      "motion-reduce:animate-none",
    );
  });
});
