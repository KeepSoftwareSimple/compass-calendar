import userEvent from "@testing-library/user-event";
import { render } from "@web/__tests__/__mocks__/mock.render";
import { Focusable } from "@web/components/Focusable/Focusable";
import { describe, expect, it } from "bun:test";

// The underline is a decorative 2px Divider with no accessible role, so it's
// matched by its stable height class. The point of these tests is the fix for
// the date-picker double-click bug: the underline must stay mounted whether or
// not the input is focused, so focusing/blurring never reflows the layout (which
// previously moved a hovered day out from under the cursor between mousedown and
// mouseup, swallowing the first click).
const underline = (container: HTMLElement) =>
  container.querySelector(".h-0\\.5");

describe("Focusable", () => {
  it("renders the underline even while unfocused when withUnderline is set", () => {
    const { container } = render(
      <Focusable Component="input" withUnderline placeholder="Title" />,
    );

    expect(document.activeElement).not.toBe(container.querySelector("input"));
    expect(underline(container)).not.toBeNull();
  });

  it("keeps the underline mounted across focus and blur", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Focusable Component="input" withUnderline placeholder="Title" />,
    );
    const input = container.querySelector("input") as HTMLInputElement;

    await user.click(input);
    expect(document.activeElement).toBe(input);
    expect(underline(container)).not.toBeNull();

    await user.click(document.body);
    expect(underline(container)).not.toBeNull();
  });

  it("renders no underline when withUnderline is not set", () => {
    const { container } = render(
      <Focusable Component="input" placeholder="Title" />,
    );

    expect(underline(container)).toBeNull();
  });
});
