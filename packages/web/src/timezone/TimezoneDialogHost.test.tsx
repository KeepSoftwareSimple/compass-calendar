import { render, screen } from "@testing-library/react";
import { act } from "react";
import { timezoneDialogActions } from "@web/timezone/timezone-dialog.store";
import { TimezoneDialogHost } from "./TimezoneDialogHost";
import { describe, expect, it } from "bun:test";

describe("TimezoneDialogHost", () => {
  it("renders nothing while closed", () => {
    render(<TimezoneDialogHost />);

    expect(
      screen.queryByRole("combobox", { name: "Search timezones" }),
    ).not.toBeInTheDocument();
  });

  it("loads the picker on first open and focuses search", async () => {
    render(<TimezoneDialogHost />);

    act(() => {
      timezoneDialogActions.open();
    });

    expect(
      await screen.findByRole("combobox", { name: "Search timezones" }),
    ).toHaveFocus();
  });
});
