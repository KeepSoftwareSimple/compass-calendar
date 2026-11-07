import "@testing-library/jest-dom";
import { MapPinIcon } from "@phosphor-icons/react/dist/csr/MapPin";
import { UsersIcon } from "@phosphor-icons/react/dist/csr/Users";
import { render, screen } from "@testing-library/react";
import {
  FORM_CARD_FIELD_INPUT_CLASSNAME,
  FormCardIconRow,
} from "@web/views/Forms/EventForm/FormCardIconRow";
import { describe, expect, it } from "bun:test";

describe("FormCardIconRow", () => {
  it("uses a fixed first-line icon column and aligned field input class", () => {
    const { container } = render(
      <>
        <FormCardIconRow icon={<MapPinIcon size={16} aria-hidden />}>
          <input
            aria-label="Location"
            className={FORM_CARD_FIELD_INPUT_CLASSNAME}
            placeholder="Location"
          />
        </FormCardIconRow>
        <FormCardIconRow icon={<UsersIcon size={16} aria-hidden />}>
          <input aria-label="Guests" placeholder="Add guests" />
        </FormCardIconRow>
      </>,
    );

    expect(screen.getByRole("textbox", { name: "Location" })).toHaveClass(
      "leading-5",
    );
    const iconColumns = container.querySelectorAll("span.w-4.h-5");
    expect(iconColumns.length).toBe(2);
    for (const column of iconColumns) {
      expect(column).toHaveClass("w-4", "h-5");
    }
    const rows = container.querySelectorAll(".flex.min-h-8.items-start");
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.querySelector(".min-w-0.flex-1.items-center")).toBeNull();
    }
  });
});
