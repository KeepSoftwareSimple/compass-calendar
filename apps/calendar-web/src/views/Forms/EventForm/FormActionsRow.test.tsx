import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormActionsRow } from "@web/views/Forms/EventForm/FormActionsRow";
import { afterEach, describe, expect, it, mock } from "bun:test";

const renderRow = (props: Partial<Parameters<typeof FormActionsRow>[0]> = {}) =>
  render(
    <FormActionsRow
      isExistingEvent={true}
      onClose={mock()}
      onDelete={mock()}
      onDuplicate={mock()}
      {...props}
    />,
  );

const actionRow = () => screen.getByRole("group", { name: "Event actions" });
const buttons = () => within(actionRow()).getAllByRole("button");

afterEach(cleanup);

describe("FormActionsRow", () => {
  it("renders duplicate, delete and close for a saved, writable event", () => {
    renderRow();

    expect(
      buttons().map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Duplicate", "Delete", "Close"]);
  });

  it("hides duplicate for an unsaved draft, which has nothing to copy", () => {
    renderRow({ isExistingEvent: false });

    expect(
      buttons().map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Delete", "Close"]);
  });

  it("hides delete for a read-only event but keeps duplicate and close", () => {
    renderRow({ isReadOnly: true });

    expect(
      buttons().map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Duplicate", "Close"]);
  });

  it("puts every action in the tab order", () => {
    renderRow();

    expect(buttons().map((button) => button.getAttribute("tabindex"))).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("tabs through duplicate, delete, and close in DOM order", async () => {
    const user = userEvent.setup();
    renderRow();
    const [duplicate, deleteButton, close] = buttons();

    duplicate.focus();
    await user.tab();
    expect(deleteButton).toHaveFocus();

    await user.tab();
    expect(close).toHaveFocus();

    await user.tab({ shift: true });
    expect(deleteButton).toHaveFocus();
  });

  it("activates the focused action with Enter after tabbing to it", async () => {
    const user = userEvent.setup();
    const onDelete = mock();
    renderRow({ onDelete });
    const [duplicate, deleteButton] = buttons();

    duplicate.focus();
    await user.tab();
    expect(deleteButton).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("calls the matching handler when a button is activated", async () => {
    const user = userEvent.setup();
    const onDuplicate = mock();
    const onDelete = mock();
    const onClose = mock();
    renderRow({ onClose, onDelete, onDuplicate });

    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reveals each action's shortcut on hover, so the keys are learnable", async () => {
    const user = userEvent.setup();
    renderRow();

    await user.hover(screen.getByRole("button", { name: "Duplicate" }));

    // The description plus one keycap per key. Mod renders as an icon on
    // every platform (the Command glyph on macOS, the Control glyph
    // elsewhere), so it contributes no text and the whole string is stable
    // wherever this runs.
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toBe("DuplicateD");
  });
});
