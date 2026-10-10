import "@testing-library/jest-dom";
import { MapPinIcon } from "@phosphor-icons/react/dist/csr/MapPin";
import { render, screen } from "@testing-library/react";
import { FormCardIconRow } from "@web/views/Forms/EventForm/FormCardIconRow";
import { describe, expect, it } from "bun:test";

describe("FormCardIconRow", () => {
  it("renders icon column and content with shared row height", () => {
    const { container } = render(
      <FormCardIconRow icon={<MapPinIcon size={16} aria-hidden />}>
        <input aria-label="Location" placeholder="Location" />
      </FormCardIconRow>,
    );

    expect(
      screen.getByRole("textbox", { name: "Location" }),
    ).toBeInTheDocument();
    const row = container.firstElementChild;
    expect(row).toHaveClass("min-h-8");
    expect(row?.querySelector("span.flex.size-4")).toBeTruthy();
  });
});
