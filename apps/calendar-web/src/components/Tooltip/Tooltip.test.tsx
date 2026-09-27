import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip, TooltipContent, TooltipTrigger } from "./Tooltip";
import { describe, expect, it, mock } from "bun:test";

describe("Tooltip interactive option", () => {
  it("defaults to non-interactive: content stays a plain hover tooltip", async () => {
    const user = userEvent.setup();
    render(
      <Tooltip>
        <TooltipTrigger>
          <button type="button">Trigger</button>
        </TooltipTrigger>
        <TooltipContent>Plain tooltip</TooltipContent>
      </Tooltip>,
    );

    await user.hover(screen.getByRole("button", { name: "Trigger" }));
    await waitFor(() => {
      expect(screen.getByText("Plain tooltip")).toBeInTheDocument();
    });
  });

  it("when interactive, the action button inside the content is clickable after hovering the trigger", async () => {
    const user = userEvent.setup();
    const onAction = mock();

    render(
      <Tooltip interactive>
        <TooltipTrigger>
          <button type="button">Trigger</button>
        </TooltipTrigger>
        <TooltipContent>
          <button onClick={onAction} type="button">
            Do the thing
          </button>
        </TooltipContent>
      </Tooltip>,
    );

    await user.hover(screen.getByRole("button", { name: "Trigger" }));

    const actionButton = await screen.findByRole("button", {
      name: "Do the thing",
    });
    await user.click(actionButton);

    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
