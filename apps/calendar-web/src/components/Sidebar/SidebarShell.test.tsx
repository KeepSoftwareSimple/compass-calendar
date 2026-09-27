import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { SIDEBAR_AUTO_COLLAPSE_BREAKPOINT } from "@web/components/AuthenticatedLayout/responsive.constants";
import {
  createGridEventDraft,
  timedGridSchedule,
} from "@web/events/grid-event-draft.adapter";
import { draftActions } from "@web/events/stores/draft.store";
import { viewActions } from "@web/events/stores/view.store";
import { SidebarShell } from "./SidebarShell";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const originalMatchMedia = window.matchMedia;

function mockViewport(isNarrow: boolean) {
  window.matchMedia = mock((query: string) => {
    const matchesMinWidth = query.includes(
      `min-width: ${SIDEBAR_AUTO_COLLAPSE_BREAKPOINT}px`,
    )
      ? !isNarrow
      : false;
    return {
      matches: matchesMinWidth,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => true,
    } as MediaQueryList;
  }) as typeof window.matchMedia;
}

function renderShell() {
  const { wrapper } = createStoreWrapper();
  return render(
    <SidebarShell shortcutSections={[]}>
      <div>Sidebar body</div>
    </SidebarShell>,
    { wrapper },
  );
}

beforeEach(() => {
  viewActions.setSidebarOpen(true);
  draftActions.discard();
  mockViewport(false);
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  draftActions.discard();
});

describe("SidebarShell", () => {
  it("keeps the dismiss control out of the sidebar on wide layouts", () => {
    mockViewport(false);
    renderShell();

    expect(
      screen.queryByRole("button", { name: "Dismiss sidebar" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Sidebar body")).toBeInTheDocument();
  });

  it("shows a dismiss control inside the sidebar on narrow layouts", async () => {
    const user = userEvent.setup();
    mockViewport(true);
    renderShell();

    const closeButton = screen.getByRole("button", { name: "Dismiss sidebar" });
    expect(closeButton).toBeInTheDocument();

    await user.click(closeButton);

    expect(
      screen.queryByRole("button", { name: "Dismiss sidebar" }),
    ).not.toBeInTheDocument();
  });

  it("keeps dismiss available on narrow layouts while an event form is open", () => {
    mockViewport(true);
    act(() => {
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
    });

    renderShell();

    expect(
      screen.getByRole("button", { name: "Dismiss sidebar" }),
    ).toBeInTheDocument();
  });
});
