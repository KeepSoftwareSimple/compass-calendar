import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopyButton } from "@web/components/CopyButton/CopyButton";
import { describe, expect, it, mock } from "bun:test";

mock.module("@web/common/utils/clipboard/clipboard.util", () => ({
  copyText: mock(async () => true),
}));

describe("CopyButton", () => {
  it("copies text and shows a checkmark label", async () => {
    const user = userEvent.setup();
    render(
      <CopyButton label="copy guest@example.com" text="guest@example.com" />,
    );

    const button = screen.getByRole("button", {
      name: "copy guest@example.com",
    });
    await user.click(button);

    expect(await screen.findByRole("button", { name: "Copied" })).toBeVisible();
  });

  it("copies when activated from the keyboard", async () => {
    const user = userEvent.setup();
    render(
      <CopyButton label="copy guest@example.com" text="guest@example.com" />,
    );

    screen.getByRole("button", { name: "copy guest@example.com" }).focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("button", { name: "Copied" })).toBeVisible();
  });

  it("is disabled when there is nothing to copy", () => {
    render(<CopyButton label="copy guest@example.com" text="   " />);
    expect(
      screen.getByRole("button", { name: "copy guest@example.com" }),
    ).toBeDisabled();
  });
});
