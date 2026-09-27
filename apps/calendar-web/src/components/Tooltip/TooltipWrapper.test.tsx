import { describe, expect, it, mock } from "bun:test";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ButtonHTMLAttributes } from "react";
import { TooltipWrapper } from "./TooltipWrapper";

describe("TooltipWrapper", () => {
  it("renders children", () => {
    render(
      <TooltipWrapper>
        <button type="button">My Button</button>
      </TooltipWrapper>,
    );
    expect(
      screen.getByRole("button", { name: /my button/i }),
    ).toBeInTheDocument();
  });

  it("shows description when provided", async () => {
    const user = userEvent.setup();
    render(
      <TooltipWrapper description="Tooltip info">
        <button type="button">Info</button>
      </TooltipWrapper>,
    );
    // Open tooltip by hovering
    const button = screen.getByRole("button", { name: /info/i });
    await user.hover(button);
    await waitFor(() => {
      expect(screen.getByText("Tooltip info")).toBeInTheDocument();
    });
  });

  it("shows description when focused", async () => {
    const user = userEvent.setup();
    render(
      <TooltipWrapper description="Keyboard info">
        <button type="button">Info</button>
      </TooltipWrapper>,
    );

    await user.tab();

    expect(screen.getByRole("button", { name: /info/i })).toHaveFocus();
    await waitFor(() => {
      expect(screen.getByText("Keyboard info")).toBeInTheDocument();
    });
  });

  it("shows shortcut when key array shortcut provided", async () => {
    const user = userEvent.setup();
    render(
      <TooltipWrapper shortcut={["Shift", "S"]}>
        <button type="button">Save</button>
      </TooltipWrapper>,
    );
    const button = screen.getByRole("button", { name: /save/i });
    await user.hover(button);
    // The combo renders one chip per key — "Shift" and "S" — not "Shift+S".
    await waitFor(() => {
      expect(screen.getByText("Shift")).toBeInTheDocument();
      expect(screen.getByText("S")).toBeInTheDocument();
    });
  });

  it("shows shortcut when ReactNode shortcut provided", async () => {
    const user = userEvent.setup();
    render(
      <TooltipWrapper shortcut={<span data-testid="shortcut-node">ALT+A</span>}>
        <button type="button">Action</button>
      </TooltipWrapper>,
    );
    const button = screen.getByRole("button", { name: /action/i });
    await user.hover(button);
    await waitFor(() => {
      expect(screen.getByTestId("shortcut-node")).toBeInTheDocument();
    });
  });

  it("calls onClick when tooltip trigger is clicked", () => {
    const onClick = mock();
    render(
      <TooltipWrapper onClick={onClick}>
        <button type="button">ClickMe</button>
      </TooltipWrapper>,
    );
    fireEvent.click(screen.getByRole("button", { name: /clickme/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const onClick = mock();
    render(
      <TooltipWrapper disabled onClick={onClick}>
        <button type="button">Disabled</button>
      </TooltipWrapper>,
    );

    fireEvent.click(screen.getByRole("button", { name: /disabled/i }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows a single-key shortcut in the tooltip", async () => {
    const user = userEvent.setup();
    render(
      <TooltipWrapper description="Help" shortcut="?">
        <button type="button">Shortcuts</button>
      </TooltipWrapper>,
    );

    await user.hover(screen.getByRole("button", { name: /shortcuts/i }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("?");
  });

  it("shows a chord shortcut in the tooltip", async () => {
    const user = userEvent.setup();
    render(
      <TooltipWrapper description="Open" shortcut={["Mod", "K"]}>
        <button type="button">Palette</button>
      </TooltipWrapper>,
    );

    await user.hover(screen.getByRole("button", { name: /palette/i }));
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Open");
    expect(tooltip).toHaveTextContent("K");
  });

  it("still opens on hover when the child is a function component without forwardRef", async () => {
    const user = userEvent.setup();
    const BareButton = ({
      children,
      ...props
    }: ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button type="button" {...props}>
        {children}
      </button>
    );

    render(
      <TooltipWrapper description="Duplicate" shortcut={["Mod", "D"]}>
        <BareButton aria-label="Duplicate">Dup</BareButton>
      </TooltipWrapper>,
    );

    await user.hover(screen.getByRole("button", { name: "Duplicate" }));
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip.textContent).toBe("DuplicateD");
  });

  it("does not render tooltip content until opened", async () => {
    const user = userEvent.setup();
    render(
      <TooltipWrapper description="Hidden text">
        <button type="button">Open</button>
      </TooltipWrapper>,
    );
    expect(screen.queryByText("Hidden text")).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: /open/i });
    await user.hover(button);
    await waitFor(() => {
      expect(screen.getByText("Hidden text")).toBeInTheDocument();
    });
  });
});
