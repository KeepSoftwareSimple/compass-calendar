import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithStore } from "@web/__tests__/render-with-store";
import { AllDayToggle } from "./AllDayToggle";
import { describe, expect, it, mock } from "bun:test";

describe("AllDayToggle", () => {
  it("labels and reports its checked state", async () => {
    const user = userEvent.setup();
    const onChange = mock();

    renderWithStore(<AllDayToggle checked={false} onChange={onChange} />);

    const toggle = screen.getByRole("checkbox", { name: "All day?" });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);

    expect(onChange).toHaveBeenCalledWith(true);
  });
});
