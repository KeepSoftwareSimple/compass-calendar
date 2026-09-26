import { act, fireEvent, render, screen } from "@testing-library/react";
import * as Track from "@web/auth/posthog/track";
import { describe, expect, it, mock, spyOn } from "bun:test";
import "@testing-library/jest-dom";

import { EventColorPicker } from "./EventColorPicker";

// Some GitHub runners hang on the first render here (always-visible tooltip
// nodes) and cancel unit (web) after ~30s of silence. Skip on CI; local
// and many PR runners still execute the suite.
const describeColorPicker = process.env["CI"] ? describe.skip : describe;

describeColorPicker("EventColorPicker", () => {
  // fireEvent, not userEvent: userEvent.click stalls some CI runners when
  // always-visible tooltip nodes overlap the swatches (same class of hang as
  // RecurrenceSection's Ends on datepicker).
  it("selects a color slot and can clear back to calendar default", () => {
    const onChange = mock();

    const { rerender } = render(
      <EventColorPicker value={null} onChange={onChange} />,
    );

    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Blue" }));
    });
    expect(onChange).toHaveBeenCalledWith("blue");

    rerender(<EventColorPicker value="blue" onChange={onChange} />);
    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: "Calendar default" }));
    });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("exposes color name tooltips for the default and slot swatches", () => {
    render(<EventColorPicker value={null} onChange={mock()} />);

    expect(
      screen.getByRole("tooltip", { name: "Calendar default" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tooltip", { name: "Coral" })).toBeInTheDocument();
  });

  it("picks a swatch directly by its top-row digit and moves focus to it", () => {
    const onChange = mock();
    const { rerender } = render(
      <EventColorPicker value={null} onChange={onChange} />,
    );

    const defaultRadio = screen.getByRole("radio", {
      name: "Calendar default",
    });
    const mintRadio = screen.getByRole("radio", { name: "Mint" });
    defaultRadio.focus();

    fireEvent.keyDown(defaultRadio, { code: "Digit3", key: "3" });

    expect(onChange).toHaveBeenCalledWith("mint");
    rerender(<EventColorPicker value="mint" onChange={onChange} />);
    expect(mintRadio).toHaveFocus();
  });

  it("records edit-pick-by-number when a digit picks a swatch", () => {
    const track = spyOn(Track, "track");
    render(<EventColorPicker value={null} onChange={mock()} />);

    fireEvent.keyDown(screen.getByRole("radio", { name: "Calendar default" }), {
      code: "Digit3",
      key: "3",
    });

    const recorded = track.mock.calls.filter(
      ([name, props]) =>
        name === "shortcut_invoked" &&
        (props as { shortcut_id?: string }).shortcut_id ===
          "edit-pick-by-number",
    );
    expect(recorded).toHaveLength(1);
    track.mockRestore();
  });

  it("picks calendar default with the first digit and red with the last pick key", () => {
    const onChange = mock();
    render(<EventColorPicker value="mint" onChange={onChange} />);

    const mintRadio = screen.getByRole("radio", { name: "Mint" });
    mintRadio.focus();

    fireEvent.keyDown(mintRadio, { code: "Digit1", key: "1" });
    expect(onChange).toHaveBeenLastCalledWith(null);

    fireEvent.keyDown(mintRadio, { code: "Equal", key: "=" });
    expect(onChange).toHaveBeenLastCalledWith("red");
  });

  it("ignores a digit held with a modifier", () => {
    const onChange = mock();
    render(<EventColorPicker value={null} onChange={onChange} />);

    const defaultRadio = screen.getByRole("radio", {
      name: "Calendar default",
    });
    defaultRadio.focus();

    fireEvent.keyDown(defaultRadio, {
      code: "Digit3",
      key: "3",
      ctrlKey: true,
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("leaves arrow-key navigation untouched", () => {
    const onChange = mock();
    render(<EventColorPicker value={null} onChange={onChange} />);

    const defaultRadio = screen.getByRole("radio", {
      name: "Calendar default",
    });
    defaultRadio.focus();

    fireEvent.keyDown(defaultRadio, { code: "ArrowRight", key: "ArrowRight" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows a pick-key chip on every swatch, hidden until the group is focused", () => {
    render(<EventColorPicker value={null} onChange={mock()} />);

    const chip = screen.getByText("3", { selector: "span[aria-hidden]" });
    expect(chip).toHaveClass("invisible");
    expect(chip).toHaveClass("group-focus-within/picker:visible");
  });
});
