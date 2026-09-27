import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, mock } from "bun:test";
import "@testing-library/jest-dom";
import { LogoutConfirmationDialog } from "./LogoutConfirmationDialog";

describe("LogoutConfirmationDialog", () => {
  it("does not render when closed", () => {
    render(
      <LogoutConfirmationDialog
        isOpen={false}
        onCancel={mock()}
        onConfirm={mock()}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lets users cancel logout", async () => {
    const user = userEvent.setup();
    const onCancel = mock();
    const onConfirm = mock();

    render(
      <LogoutConfirmationDialog
        isOpen
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("requires pressing Log out before confirming logout", async () => {
    const user = userEvent.setup();
    const onCancel = mock();
    const onConfirm = mock();

    render(
      <LogoutConfirmationDialog
        isOpen
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});
