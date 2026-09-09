import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  OverlayPanel,
  OverlayPanelActionButton,
} from "@web/components/OverlayPanel/OverlayPanel";
import { clearOverlayEscapeStack } from "@web/components/OverlayPanel/overlay-escape";
import { afterEach, describe, expect, it, mock } from "bun:test";

describe("OverlayPanel", () => {
  afterEach(() => {
    clearOverlayEscapeStack();
  });

  it("locks app shortcuts while mounted and clears on unmount", () => {
    const { unmount } = render(
      <OverlayPanel title="Confirm" onDismiss={() => {}} />,
    );

    expect(document.body.dataset.appLocked).toBe("true");
    unmount();
    expect(document.body.dataset.appLocked).toBeUndefined();
  });

  it("keeps modal dialogs from overflowing the viewport", () => {
    render(<OverlayPanel title="Settings" onDismiss={() => {}} />);

    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(dialog.className).toContain("max-h-[90vh]");
    expect(dialog.className).toContain("will-change-transform");
    expect(dialog.className).toContain("transition-transform");
    expect(dialog.className).not.toContain("overflow-y-auto");
    const scroller = dialog.firstElementChild;
    expect(scroller).not.toBeNull();
    expect(scroller?.className).toContain("overflow-y-auto");
    expect(dialog.parentElement?.className).toContain("bg-background/85");
  });

  it("centers the backdrop by default", () => {
    render(<OverlayPanel title="Confirm" onDismiss={() => {}} />);

    const backdrop = screen.getByRole("dialog", {
      name: "Confirm",
    }).parentElement;
    expect(backdrop).toHaveClass("items-center");
    expect(backdrop).not.toHaveClass("items-start");
  });

  it("anchors the backdrop to the top when requested", () => {
    render(<OverlayPanel anchor="top" title="Confirm" onDismiss={() => {}} />);

    const backdrop = screen.getByRole("dialog", {
      name: "Confirm",
    }).parentElement;
    expect(backdrop).toHaveClass("items-start");
    expect(backdrop).toHaveClass("pt-[5vh]");
    expect(backdrop).not.toHaveClass("items-center");
  });

  it("keeps the app locked when multiple panels are stacked", () => {
    const { unmount: unmountFirst } = render(
      <OverlayPanel title="First" onDismiss={() => {}} />,
    );
    const { unmount: unmountSecond } = render(
      <OverlayPanel title="Second" onDismiss={() => {}} />,
    );

    expect(document.body.dataset.appLocked).toBe("true");

    unmountFirst();
    expect(document.body.dataset.appLocked).toBe("true");
    expect(screen.getByRole("dialog", { name: "Second" })).toBeInTheDocument();

    unmountSecond();
    expect(document.body.dataset.appLocked).toBeUndefined();
  });

  it("locks status panels too", () => {
    const { unmount } = render(
      <OverlayPanel role="status" variant="status" message="Working…" />,
    );

    expect(document.body.dataset.appLocked).toBe("true");
    unmount();
    expect(document.body.dataset.appLocked).toBeUndefined();
  });

  it("names untitled dialogs via ariaLabel", () => {
    render(
      <OverlayPanel ariaLabel="Welcome guide" onDismiss={() => {}}>
        <button type="button">Close</button>
      </OverlayPanel>,
    );

    expect(
      screen.getByRole("dialog", { name: "Welcome guide" }),
    ).toBeInTheDocument();
  });

  it("traps Tab within the dialog", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Outside</button>
        <OverlayPanel title="Confirm" onDismiss={() => {}}>
          <button type="button">First</button>
          <button type="button">Last</button>
        </OverlayPanel>
      </>,
    );

    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    expect(first).toHaveFocus();

    await user.tab();
    expect(last).toHaveFocus();

    await user.tab();
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });

  it("does not trap Tab onto tabindex=-1 buttons", async () => {
    const user = userEvent.setup();
    render(
      <OverlayPanel title="Confirm" onDismiss={() => {}}>
        <button type="button">First</button>
        <button type="button" tabIndex={-1}>
          Skipped
        </button>
        <button type="button">Last</button>
      </OverlayPanel>,
    );

    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    expect(first).toHaveFocus();

    await user.tab();
    expect(last).toHaveFocus();
  });

  it("skips focus restore when skipFocusRestoreRef is set", () => {
    const skipFocusRestoreRef = { current: false };
    const { rerender } = render(<button type="button">Outside</button>);
    const outside = screen.getByRole("button", { name: "Outside" });
    outside.focus();

    rerender(
      <>
        <button type="button">Outside</button>
        <OverlayPanel
          title="Confirm"
          onDismiss={() => {}}
          skipFocusRestoreRef={skipFocusRestoreRef}
        >
          <button type="button">Inside</button>
        </OverlayPanel>
      </>,
    );
    expect(screen.getByRole("button", { name: "Inside" })).toHaveFocus();

    skipFocusRestoreRef.current = true;
    rerender(<button type="button">Outside</button>);
    expect(outside).not.toHaveFocus();
  });

  it("restores focus synchronously via restoreFocus on unmount", () => {
    const outside = document.createElement("button");
    outside.type = "button";
    outside.textContent = "Outside";
    document.body.appendChild(outside);
    outside.focus();

    const { unmount } = render(
      <OverlayPanel
        title="Confirm"
        onDismiss={() => {}}
        restoreFocus={() => outside.focus()}
      >
        <button type="button">Inside</button>
      </OverlayPanel>,
    );
    expect(screen.getByRole("button", { name: "Inside" })).toHaveFocus();

    unmount();
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it("focuses initialFocusRef instead of the first focusable", () => {
    const initialFocusRef = { current: null as HTMLButtonElement | null };
    render(
      <OverlayPanel
        title="Confirm"
        onDismiss={() => {}}
        initialFocusRef={initialFocusRef}
      >
        <button type="button">First</button>
        <button
          type="button"
          ref={(node) => {
            initialFocusRef.current = node;
          }}
        >
          Preferred
        </button>
      </OverlayPanel>,
    );

    expect(screen.getByRole("button", { name: "Preferred" })).toHaveFocus();
  });

  it("calls onModEnter for Mod+Enter without activating the focused button", async () => {
    const user = userEvent.setup();
    let confirmed = 0;
    let cancelled = 0;
    const onModEnter = () => {
      confirmed += 1;
    };

    render(
      <OverlayPanel
        title="Confirm"
        onDismiss={() => {
          cancelled += 1;
        }}
        onModEnter={onModEnter}
      >
        <button
          type="button"
          onClick={() => {
            cancelled += 1;
          }}
        >
          Cancel
        </button>
        <button type="button">Discard</button>
      </OverlayPanel>,
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(confirmed).toBe(2);
    expect(cancelled).toBe(0);
  });

  it("calls onShiftEscape for Shift+Escape and onDismiss for Escape", async () => {
    const user = userEvent.setup();
    let dismissed = 0;
    let shifted = 0;
    const onDismiss = () => {
      dismissed += 1;
    };
    const onShiftEscape = () => {
      shifted += 1;
    };

    render(
      <OverlayPanel
        title="Confirm"
        onDismiss={onDismiss}
        onShiftEscape={onShiftEscape}
      >
        <button type="button">Inside</button>
      </OverlayPanel>,
    );

    const inside = screen.getByRole("button", { name: "Inside" });
    inside.focus();

    await user.keyboard("{Escape}");
    expect(dismissed).toBe(1);
    expect(shifted).toBe(0);

    await user.keyboard("{Shift>}{Escape}{/Shift}");
    expect(shifted).toBe(1);
    expect(dismissed).toBe(1);
  });

  it("dismisses on Escape when focus is on document.body", async () => {
    const user = userEvent.setup();
    let dismissed = 0;

    render(
      <OverlayPanel
        title="Confirm"
        onDismiss={() => {
          dismissed += 1;
        }}
      >
        <button type="button">Inside</button>
      </OverlayPanel>,
    );

    (document.activeElement as HTMLElement | null)?.blur();

    await user.keyboard("{Escape}");
    expect(dismissed).toBe(1);
  });

  it("peels only the topmost dismissible panel on Escape", async () => {
    const user = userEvent.setup();
    let firstDismissed = 0;
    let secondDismissed = 0;

    render(
      <>
        <OverlayPanel
          title="First"
          onDismiss={() => {
            firstDismissed += 1;
          }}
        >
          <button type="button">First stay</button>
        </OverlayPanel>
        <OverlayPanel
          title="Second"
          onDismiss={() => {
            secondDismissed += 1;
          }}
        >
          <button type="button">Second stay</button>
        </OverlayPanel>
      </>,
    );

    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard("{Escape}");

    expect(secondDismissed).toBe(1);
    expect(firstDismissed).toBe(0);
  });

  it("does not dismiss on Escape when onDismiss is omitted", async () => {
    const user = userEvent.setup();
    render(
      <OverlayPanel title="Locked">
        <button type="button">Stay</button>
      </OverlayPanel>,
    );

    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Locked" })).toBeInTheDocument();
  });

  it("applies panelClassName on the dialog", () => {
    render(
      <OverlayPanel panelClassName="border border-border" title="Styled">
        <button type="button">Ok</button>
      </OverlayPanel>,
    );

    expect(screen.getByRole("dialog", { name: "Styled" })).toHaveClass(
      "border",
    );
  });

  it("renders an action shortcut keycap", () => {
    render(
      <OverlayPanel title="Confirm" onDismiss={() => {}}>
        <OverlayPanelActionButton shortcut="Esc">
          Cancel
        </OverlayPanelActionButton>
      </OverlayPanel>,
    );

    expect(
      within(screen.getByRole("button", { name: "Cancel" })).getByText("Esc"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute(
      "data-pointer-shortcut",
      "Esc",
    );
  });

  it("hides a shortcut chip when showShortcut is false", () => {
    render(
      <OverlayPanel title="Confirm" onDismiss={() => {}}>
        <OverlayPanelActionButton shortcut="E" showShortcut={false}>
          Export data
        </OverlayPanelActionButton>
      </OverlayPanel>,
    );

    expect(
      within(screen.getByRole("button", { name: "Export data" })).queryByText(
        "E",
      ),
    ).toBeNull();
  });

  it("does not steal focus from a text field when hovering an action", async () => {
    const onCancel = mock();
    const user = userEvent.setup({ delay: null });
    render(
      <OverlayPanel title="Share feedback" onDismiss={() => {}}>
        <textarea aria-label="What would you like to share?" />
        <OverlayPanelActionButton onClick={onCancel}>
          Cancel
        </OverlayPanelActionButton>
      </OverlayPanel>,
    );

    const notes = screen.getByRole("textbox", {
      name: "What would you like to share?",
    });
    expect(notes).toHaveFocus();
    fireEvent.pointerEnter(screen.getByRole("button", { name: "Cancel" }), {
      pointerType: "mouse",
    });
    expect(notes).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("focuses a hovered action so Enter activates that button", async () => {
    const onPrimary = mock();
    const onSecondary = mock();
    const user = userEvent.setup({ delay: null });
    render(
      <OverlayPanel title="Confirm" onDismiss={() => {}}>
        <OverlayPanelActionButton onClick={onPrimary}>
          Primary
        </OverlayPanelActionButton>
        <OverlayPanelActionButton onClick={onSecondary}>
          Secondary
        </OverlayPanelActionButton>
      </OverlayPanel>,
    );

    const secondary = screen.getByRole("button", { name: "Secondary" });
    fireEvent.pointerEnter(secondary, { pointerType: "mouse" });
    expect(secondary).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onSecondary).toHaveBeenCalled();
    expect(onPrimary).not.toHaveBeenCalled();
  });
});
