import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, mock } from "bun:test";
import "@testing-library/jest-dom";
import { DeleteAccountFailureDialog } from "./DeleteAccountFailureDialog";

describe("DeleteAccountFailureDialog", () => {
  it("does not render when closed", () => {
    render(
      <DeleteAccountFailureDialog
        isOpen={false}
        onCancel={mock()}
        onRetry={mock()}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("retries from the keyboard with Enter", async () => {
    const user = userEvent.setup();
    const onCancel = mock();
    const onRetry = mock();

    render(
      <DeleteAccountFailureDialog
        isOpen
        onCancel={onCancel}
        onRetry={onRetry}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: /couldn't delete your account/i }),
    ).toHaveTextContent(/your account is still here/i);

    await user.keyboard("{Enter}");

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels from the keyboard with Escape", async () => {
    const user = userEvent.setup();
    const onCancel = mock();
    const onRetry = mock();

    render(
      <DeleteAccountFailureDialog
        isOpen
        onCancel={onCancel}
        onRetry={onRetry}
      />,
    );

    await user.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
