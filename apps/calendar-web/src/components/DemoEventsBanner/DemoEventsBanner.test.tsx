import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { DemoEventsBanner } from "@web/components/DemoEventsBanner/DemoEventsBanner";
import { DEMO_EVENTS_BANNER_SHORTCUT_KEY } from "@web/shortcuts/notice-focus/useNoticeActionShortcut";
import { eventJumpActions } from "@web/shortcuts/shift-hint/event-jump.store";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import "@testing-library/jest-dom";

const renderBanner = (onDismiss = mock()) =>
  render(
    <HotkeysProvider>
      <DemoEventsBanner onDismiss={onDismiss} />
    </HotkeysProvider>,
  );

describe("DemoEventsBanner", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
    eventJumpActions.reset();
  });

  afterEach(() => {
    cleanup();
    eventJumpActions.reset();
  });

  it("dismisses on its key and shows that key", () => {
    const onDismiss = mock();
    renderBanner(onDismiss);

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Okay");
    expect(banner).toHaveTextContent(DEMO_EVENTS_BANNER_SHORTCUT_KEY);

    pressKey(DEMO_EVENTS_BANNER_SHORTCUT_KEY);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("has no button, and a click only advertises the key", async () => {
    const onDismiss = mock();
    const user = userEvent.setup();
    renderBanner(onDismiss);

    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status")).toBeInTheDocument();

    await user.click(screen.getByText("Okay"));

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("stands down while event jump owns the letters", () => {
    const onDismiss = mock();
    eventJumpActions.setActive(true);
    renderBanner(onDismiss);

    pressKey(DEMO_EVENTS_BANNER_SHORTCUT_KEY);

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
