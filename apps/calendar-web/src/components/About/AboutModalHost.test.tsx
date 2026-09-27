import { screen } from "@testing-library/react";
import { act } from "react";
import { renderWithStore } from "@web/__tests__/render-with-store";
import { settingsActions } from "@web/settings/settings.store";
import { AboutModalHost } from "./AboutModalHost";
import { describe, expect, it } from "bun:test";

describe("AboutModalHost", () => {
  it("renders nothing while closed", () => {
    renderWithStore(<AboutModalHost />, { settings: { isAboutOpen: false } });

    expect(screen.queryByText("About Compass")).not.toBeInTheDocument();
  });

  it("loads About on first open and keeps copy focused", async () => {
    renderWithStore(<AboutModalHost />);

    act(() => {
      settingsActions.openAbout();
    });

    expect(
      await screen.findByRole("dialog", { name: "About Compass" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toHaveFocus();
  });
});
