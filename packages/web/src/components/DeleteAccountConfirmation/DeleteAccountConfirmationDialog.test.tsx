import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, mock } from "bun:test";
import "@testing-library/jest-dom";
import {
  DELETE_ACCOUNT_PHRASE,
  DeleteAccountConfirmationDialog,
} from "./DeleteAccountConfirmationDialog";

const setup = () => {
  const onCancel = mock();
  const onConfirm = mock();

  render(
    <DeleteAccountConfirmationDialog
      isOpen
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  );

  return {
    confirmButton: screen.getByRole("button", { name: "Delete account" }),
    input: screen.getByRole("textbox"),
    onCancel,
    onConfirm,
    user: userEvent.setup(),
  };
};

describe("DeleteAccountConfirmationDialog", () => {
  it("does not render when closed", () => {
    render(
      <DeleteAccountConfirmationDialog
        isOpen={false}
        onCancel={mock()}
        onConfirm={mock()}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("tells the user their connected calendar data is left alone", () => {
    setup();

    expect(screen.getByRole("dialog")).toHaveTextContent(
      /Your calendar is not affected/i,
    );
  });

  it("explains the trial and subscription cancellation", () => {
    setup();

    expect(screen.getByRole("dialog")).toHaveTextContent(
      /trial or subscription.*canceled immediately/i,
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      /previous payments aren't refunded automatically/i,
    );
  });

  it("keeps confirm disabled until the phrase is typed exactly", async () => {
    const { confirmButton, input, user } = setup();

    expect(confirmButton).toBeDisabled();

    await user.type(input, "delete my compass account");
    expect(confirmButton).toBeDisabled();

    await user.clear(input);
    await user.type(input, DELETE_ACCOUNT_PHRASE);
    expect(confirmButton).toBeEnabled();
  });

  it("confirms once the phrase is typed", async () => {
    const { confirmButton, input, onConfirm, user } = setup();

    await user.type(input, DELETE_ACCOUNT_PHRASE);
    await user.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("confirms from the keyboard with Enter after the phrase is typed", async () => {
    const { input, onConfirm, user } = setup();

    await user.type(input, DELETE_ACCOUNT_PHRASE);
    await user.keyboard("{Enter}");

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("does not confirm on Enter until the phrase matches", async () => {
    const { input, onConfirm, user } = setup();

    await user.type(input, "not the phrase");
    await user.keyboard("{Enter}");

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("blocks pasting the phrase, so it has to be typed", async () => {
    const { confirmButton, input, user } = setup();

    await user.click(input);
    await user.paste(DELETE_ACCOUNT_PHRASE);

    expect(input).toHaveValue("");
    expect(confirmButton).toBeDisabled();
  });

  it("lets users cancel", async () => {
    const { onCancel, onConfirm, user } = setup();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
