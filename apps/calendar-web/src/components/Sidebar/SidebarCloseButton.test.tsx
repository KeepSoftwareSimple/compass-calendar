import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import {
  createGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import {
  draftActions,
  selectIsEventFormOpen,
  useDraftStore,
} from "@web/events/stores/draft.store";
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
  const isEventFormOpen = useDraftStore(selectIsEventFormOpen);
  return (
    <div>
      <SidebarToggleButton />
      {isOpen || isEventFormOpen ? <SidebarCloseButton /> : null}
    </div>
  );
}

beforeEach(() => {
  viewActions.setSidebarOpen(true);
  draftActions.discard();
});

describe("SidebarCloseButton", () => {
  it("closes the sidebar and focuses the header open control", async () => {
    const user = userEvent.setup();
    const { wrapper } = createStoreWrapper();

    render(<Harness />, { wrapper });

    await user.click(screen.getByRole("button", { name: "Dismiss sidebar" }));

    expect(
      screen.queryByRole("button", { name: "Dismiss sidebar" }),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Open sidebar" }),
      ).toHaveFocus();
    });
  });

  it("also discards an open event form so the panel can fully close", async () => {
    const user = userEvent.setup();
    const { wrapper } = createStoreWrapper();
    viewActions.setSidebarOpen(false);
    draftActions.startGridDraft({
      activity: "gridClick",
      draft: createGridEventDraft(
        timedGridSchedule(
          new Date("2026-05-20T09:00:00.000Z"),
          new Date("2026-05-20T10:00:00.000Z"),
        ),
      ),
    });
    draftActions.setFormOpen(true);

    render(<Harness />, { wrapper });

    await user.click(screen.getByRole("button", { name: "Dismiss sidebar" }));

    expect(selectIsEventFormOpen(useDraftStore.getState())).toBe(false);
    expect(
      screen.queryByRole("button", { name: "Dismiss sidebar" }),
    ).not.toBeInTheDocument();
  });
});
