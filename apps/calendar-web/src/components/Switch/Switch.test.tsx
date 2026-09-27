import "@testing-library/jest-dom";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Switch } from "@web/components/Switch/Switch";
import { afterEach, describe, expect, it, mock } from "bun:test";

afterEach(() => {
  cleanup();
});

describe("Switch", () => {
  it("reflects aria-checked from checked", () => {
    const { rerender } = render(
      <Switch
        checked={false}
        id="meeting-page"
        label="Meeting page"
        onCheckedChange={() => {}}
      />,
    );

    expect(
      screen.getByRole("switch", { name: "Meeting page" }),
    ).toHaveAttribute("aria-checked", "false");

    rerender(
      <Switch
        checked={true}
        id="meeting-page"
        label="Meeting page"
        onCheckedChange={() => {}}
      />,
    );

    expect(
      screen.getByRole("switch", { name: "Meeting page" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("click and Space call onCheckedChange with the flipped value", async () => {
    const user = userEvent.setup();
    const onCheckedChange = mock();
    render(
      <Switch
        checked={false}
        id="meeting-page"
        label="Meeting page"
        onCheckedChange={onCheckedChange}
      />,
    );

    const control = screen.getByRole("switch", { name: "Meeting page" });
    await user.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(true);

    onCheckedChange.mockClear();
    control.focus();
    await user.keyboard(" ");
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("busy sets aria-busy and blocks clicks", async () => {
    const user = userEvent.setup();
    const onCheckedChange = mock();
    render(
      <Switch
        busy
        checked={false}
        id="meeting-page"
        label="Meeting page"
        onCheckedChange={onCheckedChange}
      />,
    );

    const control = screen.getByRole("switch", { name: "Meeting page" });
    expect(control).toHaveAttribute("aria-busy", "true");
    expect(control).toBeDisabled();
    await user.click(control);
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("label click focuses the switch", async () => {
    const user = userEvent.setup();
    render(
      <Switch
        checked={false}
        id="meeting-page"
        label="Meeting page"
        onCheckedChange={() => {}}
      />,
    );

    await user.click(screen.getByText("Meeting page"));
    expect(screen.getByRole("switch", { name: "Meeting page" })).toHaveFocus();
  });
});
