import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import {
  selectIsSidebarOpen,
  useViewStore,
  viewActions,
} from "@web/events/stores/view.store";
import { SidebarCloseButton } from "./SidebarCloseButton";
import { SidebarToggleButton } from "./SidebarToggleButton";
import { beforeEach, describe, expect, it } from "bun:test";

function Harness() {
  const isOpen = useViewStore(selectIsSidebarOpen);
  return (
    <div>
      <SidebarToggleButton />
      {isOpen ? <SidebarCloseButton /> : null}
    </div>
  );
}

describe("SidebarToggleButton", () => {
  beforeEach(() => {
    viewActions.setSidebarOpen(false);
  });

  it("opens the sidebar when labeled open", async () => {
    const user = userEvent.setup();
    const { wrapper } = createStoreWrapper();

    render(<SidebarToggleButton />, { wrapper });

    expect(
      screen.getByRole("button", { name: "Open sidebar" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open sidebar" }));

    expect(
      screen.getByRole("button", { name: "Close sidebar" }),
    ).toBeInTheDocument();
  });

  it("closes the sidebar when labeled close", async () => {
    const user = userEvent.setup();
    const { wrapper } = createStoreWrapper();
    viewActions.setSidebarOpen(true);

    render(<SidebarToggleButton />, { wrapper });

    expect(
      screen.getByRole("button", { name: "Close sidebar" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close sidebar" }));

    expect(
      screen.getByRole("button", { name: "Open sidebar" }),
    ).toBeInTheDocument();
  });

  it("focuses the dismiss control after opening when it is present", async () => {
    const user = userEvent.setup();
    const { wrapper } = createStoreWrapper();

    render(<Harness />, { wrapper });

    await user.click(screen.getByRole("button", { name: "Open sidebar" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Dismiss sidebar" }),
      ).toHaveFocus();
    });
  });
});
