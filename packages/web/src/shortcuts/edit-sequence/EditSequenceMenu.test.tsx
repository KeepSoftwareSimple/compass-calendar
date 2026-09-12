import { render, screen } from "@web/__tests__/__mocks__/mock.render";
import { EditSequenceMenu } from "@web/shortcuts/edit-sequence/EditSequenceMenu";
import { editSequenceActions } from "@web/shortcuts/edit-sequence/edit-sequence.store";
import { afterEach, describe, expect, it } from "bun:test";

/**
 * Placement is floating-ui's (offset/flip/shift + autoUpdate), so there is no
 * positioning math of ours left to unit test; jsdom has no layout to exercise
 * it against either. These cover what this component still owns: when it
 * renders, and what it says.
 */
describe("EditSequenceMenu", () => {
  afterEach(() => {
    // No manual DOM reset here: the menu renders through a portal, and
    // clearing document.body out from under React breaks its unmount.
    editSequenceActions.disarm();
  });

  const showMenu = () => {
    editSequenceActions.arm();
    editSequenceActions.showMenu();
  };

  it("renders nothing until the menu is visible", () => {
    render(<EditSequenceMenu getAnchor={() => null} />);

    expect(document.querySelector("[data-edit-sequence-menu]")).toBeNull();
  });

  it("renders once the menu becomes visible", () => {
    showMenu();
    render(<EditSequenceMenu getAnchor={() => null} />);

    expect(document.querySelector("[data-edit-sequence-menu]")).not.toBeNull();
  });

  it("announces every option to screen readers", () => {
    showMenu();
    render(<EditSequenceMenu getAnchor={() => null} />);

    expect(
      screen.getByRole("status", { hidden: true }).textContent,
    ).toStrictEqual(
      "Edit which field? T for title, L for location, D for description, " +
        "S for start time, E for end time, R for recurrence, C for color, " +
        "A for guests, G for going. " +
        "Escape to cancel." +
        "Edit which field?TTitleLLocationDDescriptionSStart timeEEnd time" +
        "RRecurrenceCColorAGuestsGGoingEsc to cancel",
    );
  });

  it("lists each second key with its field", () => {
    showMenu();
    render(<EditSequenceMenu getAnchor={() => null} />);

    const menu = document.querySelector("[data-edit-sequence-menu]");
    for (const label of [
      "Title",
      "Location",
      "Description",
      "Start time",
      "End time",
      "Recurrence",
      "Color",
      "Guests",
      "Going",
    ]) {
      expect(menu?.textContent).toContain(label);
    }
    expect(menu?.textContent).not.toContain("Account");
  });

  it("still renders when the anchor is gone, using the viewport fallback", () => {
    showMenu();
    const detached = document.createElement("div");
    render(<EditSequenceMenu getAnchor={() => detached} />);

    expect(document.querySelector("[data-edit-sequence-menu]")).not.toBeNull();
  });
});
