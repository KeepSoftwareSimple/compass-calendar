import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { RetryableSaveToast } from "@web/common/utils/toast/retryable-save.toast";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const MESSAGE =
  "Couldn't save that change, the calendar service is briefly unavailable. Your edit was not applied.";

describe("RetryableSaveToast", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    HotkeyManager.resetInstance();
    document.body.removeAttribute("data-app-locked");
    mocks.dismiss.mockClear();
    registerToastPort(port);
  });

  it("retries and dismisses itself when the button is clicked", async () => {
    const onRetry = mock();
    render(
      <HotkeysProvider>
        <RetryableSaveToast
          message={MESSAGE}
          onRetry={onRetry}
          toastId="event-save-retryable"
        />
      </HotkeysProvider>,
    );

    expect(screen.getByText(MESSAGE)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));

    expect(onRetry).toHaveBeenCalledTimes(1);
    // Dismiss before re-dispatching: a stale toast sitting over a retry that
    // is already in flight reads as though nothing happened.
    expect(mocks.dismiss).toHaveBeenCalledWith("event-save-retryable");
  });

  it("retries from the keyboard, so a save can recover without the mouse", () => {
    const onRetry = mock();
    render(
      <HotkeysProvider>
        <RetryableSaveToast
          message={MESSAGE}
          onRetry={onRetry}
          toastId="event-save-retryable"
        />
      </HotkeysProvider>,
    );

    // `S`, the shared action-toast CTA key. A session-expired error returns
    // before this toast is ever shown, so the two never compete for it.
    pressKey("S");

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
