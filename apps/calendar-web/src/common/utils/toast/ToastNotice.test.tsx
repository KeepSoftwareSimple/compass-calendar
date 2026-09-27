import { render, screen } from "@testing-library/react";
import { ToastNotice } from "@web/common/utils/toast/ToastNotice";
import { describe, expect, it } from "bun:test";

describe("ToastNotice", () => {
  it("renders the body and an Esc dismiss tip, without a close button", () => {
    render(
      <ToastNotice>
        <p>Sign up to save your calendar across browsers.</p>
        <button type="button">Sign up</button>
      </ToastNotice>,
    );

    expect(
      screen.getByText("Sign up to save your calendar across browsers."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign up" })).toBeTruthy();
    expect(screen.getByText("Press Esc to dismiss")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });
});
