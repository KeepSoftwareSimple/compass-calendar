import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import "@testing-library/jest-dom";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import {
  POINTER_ACTION_ATTRIBUTE,
  POINTER_ACTIONS,
  POINTER_SHORTCUT_ATTRIBUTE,
} from "@web/shortcuts/keyboard-only/pointer-action";
import { CONNECTION_BANNER_SHORTCUT_KEY } from "@web/shortcuts/notice-focus/useNoticeActionShortcut";
import { eventJumpActions } from "@web/shortcuts/shift-hint/event-jump.store";
import { CalendarConnectionBanner } from "./CalendarConnectionBanner";

afterEach(() => {
  cleanup();
  eventJumpActions.reset();
});

const renderBanner = (
  kind: "reconnect" | "importFailed" | "delayed",
  onAction = mock(),
) =>
  render(
    <HotkeysProvider>
      <CalendarConnectionBanner kind={kind} onAction={onAction} />
    </HotkeysProvider>,
  );

describe("CalendarConnectionBanner", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
    eventJumpActions.reset();
  });

  it("shows a reconnect action for revoked access", async () => {
    const onAction = mock();
    const user = userEvent.setup();

    renderBanner("reconnect", onAction);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Google Calendar needs reconnecting.",
    );
    await user.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("shows Microsoft reconnect copy for a Microsoft connection", () => {
    const onAction = mock();
    render(
      <HotkeysProvider>
        <CalendarConnectionBanner
          kind="reconnect"
          onAction={onAction}
          provider="microsoft"
        />
      </HotkeysProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Microsoft Calendar needs reconnecting.",
    );
  });

  it("renders the consentRequired copy whole with a reconnect action", async () => {
    const onAction = mock();
    const user = userEvent.setup();
    render(
      <HotkeysProvider>
        <CalendarConnectionBanner
          kind="consentRequired"
          onAction={onAction}
          provider="microsoft"
        />
      </HotkeysProvider>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your organization's admin has to approve Compass before this account can connect.",
    );
    await user.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("shows a G keycap and reconnects when G is pressed", () => {
    const onAction = mock();
    renderBanner("reconnect", onAction);

    const button = screen.getByRole("button", { name: "Reconnect" });
    expect(within(button).getByText("G")).toBeTruthy();
    expect(button).toHaveAttribute(
      POINTER_SHORTCUT_ATTRIBUTE,
      CONNECTION_BANNER_SHORTCUT_KEY,
    );
    expect(button).toHaveAttribute(
      POINTER_ACTION_ATTRIBUTE,
      POINTER_ACTIONS.reconnectGoogle,
    );

    pressKey("G");

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("leaves digit 1 for quick-time create", () => {
    const onAction = mock();
    renderBanner("reconnect", onAction);

    pressKey("1");

    expect(onAction).not.toHaveBeenCalled();
  });

  it("does not reconnect with G while event jump is active", () => {
    const onAction = mock();
    eventJumpActions.setActive(true);
    renderBanner("reconnect", onAction);

    pressKey("G");

    expect(onAction).not.toHaveBeenCalled();
  });

  it("shows retry when the first import failed", async () => {
    const onAction = mock();
    const user = userEvent.setup();

    renderBanner("importFailed", onAction);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't add your calendar.",
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("shows refresh when calendar updates are delayed", async () => {
    const onAction = mock();
    const user = userEvent.setup();

    renderBanner("delayed", onAction);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Calendar updates are delayed.",
    );
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("runs Refresh with G, the same letter as the delayed toast", () => {
    const onAction = mock();
    renderBanner("delayed", onAction);

    const button = screen.getByRole("button", { name: "Refresh" });
    expect(within(button).getByText("G")).toBeTruthy();

    pressKey("G");

    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
