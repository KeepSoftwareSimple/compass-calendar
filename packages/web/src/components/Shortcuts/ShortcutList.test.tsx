import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShortcutList } from "./ShortcutList";
import { describe, expect, it, mock } from "bun:test";

describe("ShortcutList", () => {
  // A single key combo can legitimately appear more than once in a section.
  // Keying rows on the combo alone made those collide, firing React's "two
  // children with the same key" warning and risking omitted rows. Both rows
  // must render, warning-free.
  it("renders duplicate key combos with distinct labels and no key collision", () => {
    const consoleError = mock((..._args: unknown[]) => {});
    const originalError = console.error;
    console.error = consoleError;

    try {
      render(
        <ShortcutList
          shortcuts={[
            {
              id: "move-next",
              keys: ["Shift", "ArrowRight"],
              label: "Move event to next day",
              section: "edit",
            },
            {
              id: "move-sidebar",
              keys: ["Shift", "ArrowRight"],
              label: "Move event to sidebar",
              section: "edit",
            },
          ]}
        />,
      );
    } finally {
      console.error = originalError;
    }

    expect(screen.getByText("Move event to next day")).toBeInTheDocument();
    expect(screen.getByText("Move event to sidebar")).toBeInTheDocument();
    expect(
      consoleError.mock.calls.some((call) =>
        String(call[0]).includes("same key"),
      ),
    ).toBe(false);
  });

  it("renders each key of a combo as its own keycap chip", () => {
    render(
      <ShortcutList
        shortcuts={[
          {
            id: "create-allday",
            keys: ["Shift", "w"],
            label: "Create all-day event",
            section: "create",
          },
        ]}
      />,
    );

    const row = screen
      .getByText("Create all-day event")
      .closest("li") as HTMLLIElement;
    const keycaps = row.querySelectorAll("[aria-hidden='true']");
    const label = screen.getByText("Create all-day event");

    // One chip per key — "Shift" and "W" — rather than a single "Shift + w".
    expect(keycaps).toHaveLength(2);
    expect(keycaps[0]?.textContent).toBe("Shift");
    expect(keycaps[1]?.textContent).toBe("W");
    expect(label).toHaveClass("flex-1");
    expect(label).not.toHaveClass("truncate");
    expect(row).toHaveClass("justify-between");
    expect(row).not.toHaveClass("border");
  });

  it("marks a used shortcut with a check and screen-reader text", () => {
    render(
      <ShortcutList
        shortcuts={[
          {
            id: "nav-today",
            keys: ["t"],
            label: "Go to today",
            section: "navigate",
            used: true,
          },
        ]}
      />,
    );

    const row = screen.getByText("Go to today").closest("li") as HTMLLIElement;
    expect(screen.getByText("used")).toBeInTheDocument();
    expect(row.querySelector("svg")).not.toBeNull();
  });

  it("shows a Pro badge and tooltip on a locked write shortcut", async () => {
    const user = userEvent.setup();
    render(
      <ShortcutList
        shortcuts={[
          {
            id: "create-timed",
            keys: ["c"],
            label: "Create timed event",
            section: "create",
            requiresWrite: true,
            locked: true,
          },
        ]}
      />,
    );

    expect(screen.getByText("Premium")).toBeInTheDocument();
    expect(screen.getByText("Premium shortcut.")).toBeInTheDocument();
    await user.hover(screen.getByText("Create timed event"));
    expect(
      await screen.findByText("Included with Premium"),
    ).toBeInTheDocument();
  });
});
