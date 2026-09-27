import { resolveModifier } from "@tanstack/react-hotkeys";
import userEvent from "@testing-library/user-event";
import { render, screen, within } from "@web/__tests__/__mocks__/mock.render";
import { DiscardUnsavedChangesDialog } from "@web/views/Forms/EventForm/DiscardUnsavedChangesDialog";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const onDiscard = mock();
const onCancel = mock();

beforeEach(() => {
  onDiscard.mockClear();
  onCancel.mockClear();
});

const renderDialog = (isOpen: boolean) =>
  render(
    <DiscardUnsavedChangesDialog
      isOpen={isOpen}
      onCancel={onCancel}
      onDiscard={onDiscard}
    />,
  );

describe("DiscardUnsavedChangesDialog", () => {
  it("renders nothing when closed", () => {
    renderDialog(false);

    expect(
      screen.queryByRole("dialog", { name: "Discard unsaved changes?" }),
    ).not.toBeInTheDocument();
  });

  it("shows the title and action buttons when open", () => {
    renderDialog(true);

    expect(
      screen.getByRole("dialog", { name: "Discard unsaved changes?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("focuses Cancel on open and Tabs to Discard", async () => {
    const user = userEvent.setup();
    renderDialog(true);

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Discard" })).toHaveFocus();
  });

  it("discards and cancels via the action buttons", async () => {
    const user = userEvent.setup();
    renderDialog(true);

    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels via the close button", async () => {
    const user = userEvent.setup();
    renderDialog(true);

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("cancels on Escape", async () => {
    const user = userEvent.setup();
    renderDialog(true);

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("discards on Shift+Escape", async () => {
    const user = userEvent.setup();
    renderDialog(true);

    await user.keyboard("{Shift>}{Escape}{/Shift}");
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancels on Enter while Cancel is focused", async () => {
    const user = userEvent.setup();
    renderDialog(true);

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("discards on Mod+Enter while Cancel is focused", async () => {
    const user = userEvent.setup();
    renderDialog(true);

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    const chord =
      resolveModifier("Mod") === "Control"
        ? "{Control>}{Enter}{/Control}"
        : "{Meta>}{Enter}{/Meta}";
    await user.keyboard(chord);

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("shows Mod+Enter on Discard instead of Enter", () => {
    renderDialog(true);

    const discard = screen.getByRole("button", { name: "Discard" });
    expect(discard).toHaveAttribute(
      "aria-keyshortcuts",
      "Meta+Enter Control+Enter",
    );
    expect(within(discard).getByText("Enter")).toBeInTheDocument();
    expect(
      within(discard).queryByTestId("meta-icon") ??
        within(discard).queryByTestId("control-icon"),
    ).toBeInTheDocument();
  });
});
