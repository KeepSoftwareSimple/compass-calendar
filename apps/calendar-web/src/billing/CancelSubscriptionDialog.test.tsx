import { resolveModifier } from "@tanstack/react-hotkeys";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CancelSubscriptionDialog } from "@web/billing/CancelSubscriptionDialog";
import { describe, expect, it, mock } from "bun:test";

const PERIOD_END = "Apr 1, 2026";

function renderDialog(
  overrides: Partial<Parameters<typeof CancelSubscriptionDialog>[0]> = {},
) {
  const onCancel = mock(() => {});
  const onConfirm = mock(() => {});
  render(
    <CancelSubscriptionDialog
      isOpen
      isSubmitting={false}
      isTrialing={false}
      periodEndLabel={PERIOD_END}
      onCancel={onCancel}
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return { onCancel, onConfirm };
}

describe("CancelSubscriptionDialog", () => {
  it("confirms without a reason when the user skips the question", async () => {
    const user = userEvent.setup({ delay: null });
    const { onConfirm } = renderDialog();

    await user.click(
      screen.getByRole("button", { name: "Cancel subscription" }),
    );

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it("passes the selected reason slug and Other details on confirm", async () => {
    const user = userEvent.setup({ delay: null });
    const { onConfirm } = renderDialog();

    await user.click(screen.getByRole("radio", { name: "Other" }));
    await user.type(
      screen.getByRole("textbox", { name: "Other reason" }),
      "Needs shared calendars",
    );
    await user.click(
      screen.getByRole("button", { name: "Cancel subscription" }),
    );

    expect(onConfirm).toHaveBeenCalledWith({
      reason: "other",
      details: "Needs shared calendars",
    });
  });

  it("does not confirm on Enter alone in the Other text field", async () => {
    const user = userEvent.setup({ delay: null });
    const { onConfirm } = renderDialog();

    await user.click(screen.getByRole("radio", { name: "Other" }));
    const field = screen.getByRole("textbox", { name: "Other reason" });
    await user.click(field);
    await user.keyboard("{Enter}");

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirms on Mod+Enter from the dialog", async () => {
    const user = userEvent.setup({ delay: null });
    const { onConfirm } = renderDialog();

    await user.click(screen.getByRole("radio", { name: "Too expensive" }));

    const chord =
      resolveModifier("Mod") === "Control"
        ? "{Control>}{Enter}{/Control}"
        : "{Meta>}{Enter}{/Meta}";
    await user.keyboard(chord);

    expect(onConfirm).toHaveBeenCalledWith({ reason: "too_expensive" });
  });

  it("shows Mod+Enter on the destructive action", () => {
    renderDialog();

    const submit = screen.getByRole("button", { name: "Cancel subscription" });
    expect(submit).toHaveAttribute(
      "aria-keyshortcuts",
      "Meta+Enter Control+Enter",
    );
    expect(within(submit).getByText("Enter")).toBeInTheDocument();
  });
});
