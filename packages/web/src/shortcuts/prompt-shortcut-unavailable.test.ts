import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import {
  EVENT_EDITING_SHORTCUT_UNAVAILABLE_MESSAGE,
  promptShortcutUnavailable,
  promptShortcutUnavailableWhileEditingEvent,
  SHORTCUT_UNAVAILABLE_TOAST_ID,
} from "@web/shortcuts/prompt-shortcut-unavailable";
import { beforeEach, describe, expect, it } from "bun:test";

describe("promptShortcutUnavailable", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    mocks.toast.mockClear();
    mocks.update.mockClear();
    registerToastPort(port);
  });

  it("shows the message on the shared overlay-unavailable toast", () => {
    promptShortcutUnavailable("Shortcut unavailable (press Esc to close)");

    expect(mocks.toast).toHaveBeenCalledWith(
      "Shortcut unavailable (press Esc to close)",
      expect.objectContaining({ toastId: SHORTCUT_UNAVAILABLE_TOAST_ID }),
    );
  });

  it("explains that event-editing shortcuts stand down until Esc closes the form", () => {
    promptShortcutUnavailableWhileEditingEvent();

    expect(mocks.toast).toHaveBeenCalledWith(
      EVENT_EDITING_SHORTCUT_UNAVAILABLE_MESSAGE,
      expect.objectContaining({
        toastId: SHORTCUT_UNAVAILABLE_TOAST_ID,
        closeButton: false,
        hideProgressBar: true,
      }),
    );
  });
});
