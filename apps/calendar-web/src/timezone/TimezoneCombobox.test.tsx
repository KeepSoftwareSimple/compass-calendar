import "@testing-library/jest-dom";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type TimeZone, TimeZoneSchema } from "@core/types/domain-primitives";
import { BookingTimezoneField } from "@web/booking/BookingTimezoneField";
import { TimezoneCombobox } from "@web/timezone/TimezoneCombobox";
import { afterEach, describe, expect, it, mock } from "bun:test";

/**
 * The booking field's cases live here rather than in their own file on
 * purpose. The web suite runs every file in one process, and it has little
 * headroom: a second new file was enough to push the CI job past the point
 * where it gets killed mid-run with no failing test.
 */

const noop = () => {};
const zone = (id: string): TimeZone => TimeZoneSchema.parse(id);

afterEach(() => {
  // Unmount, not just empty the DOM: OverlayPanel registers an app-lock reason
  // and document listeners in effects, and replaceChildren alone never runs
  // their teardown, so every render in the file would stay retained.
  cleanup();
  document.body.replaceChildren();
});

describe("TimezoneCombobox", () => {
  it("filters by query and commits the active row on Enter", async () => {
    const user = userEvent.setup({ delay: null });
    const onSelect = mock(noop);

    render(
      <TimezoneCombobox
        onSelect={onSelect}
        searchLabel="Search timezones"
        value="America/Chicago"
      />,
    );

    const input = screen.getByRole("combobox");
    await user.type(input, "berlin");
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith("Europe/Berlin");
    // aria-activedescendant is the whole point: real focus stays in the input
    // so Tab is free to move past the control.
    expect(document.activeElement).toBe(input);
  });

  it("shows a non-canonical alias that the IANA catalog omits", () => {
    render(
      <TimezoneCombobox
        onSelect={noop}
        searchLabel="Search timezones"
        // Intl.supportedValuesOf reports only canonical ids, so this zone has
        // no catalog row and used to render as nothing at all.
        value="US/Pacific"
      />,
    );

    expect(screen.getByRole("option", { name: /Pacific/ })).toBeInTheDocument();
    // One rendered page, not the ~420-entry catalog.
    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(41);
  });

  it("commits a head option's value rather than its id", async () => {
    const user = userEvent.setup({ delay: null });
    const onSelect = mock(noop);

    render(
      <TimezoneCombobox
        headOptions={[
          {
            description: "Currently CDT",
            id: "auto",
            label: "Use browser timezone (Auto)",
            selected: true,
            value: null,
          },
        ]}
        onSelect={onSelect}
        searchLabel="Search timezones"
        value={null}
      />,
    );

    await user.click(
      screen.getByRole("option", { name: /Use browser timezone/ }),
    );

    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

describe("BookingTimezoneField", () => {
  it("picks a zone by typing, then closes and reports it", async () => {
    const user = userEvent.setup({ delay: null });
    const onChange = mock((_next: TimeZone) => {});

    render(
      <BookingTimezoneField
        onChange={onChange}
        timeZone={zone("America/Chicago")}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /^Meeting timezone:/ }),
    );
    await user.type(screen.getByRole("combobox"), "berlin");
    await user.keyboard("{Enter}");

    expect(onChange).toHaveBeenCalledWith("Europe/Berlin");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renders a non-canonical alias instead of going blank", () => {
    // The old native <select> had no <option> for an alias, so it showed the
    // first zone in the catalog while state held something else.
    render(
      <BookingTimezoneField onChange={noop} timeZone={zone("US/Pacific")} />,
    );

    expect(
      screen.getByRole("button", { name: /^Meeting timezone: Pacific/ }),
    ).toBeInTheDocument();
  });
});
