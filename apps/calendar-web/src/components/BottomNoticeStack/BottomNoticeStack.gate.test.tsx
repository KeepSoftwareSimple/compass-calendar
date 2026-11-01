import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { showAppUpdateAvailableToast } from "@web/common/utils/toast/app-update-available.toast";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { BottomNoticeStack } from "@web/components/BottomNoticeStack/BottomNoticeStack";
import { BottomNoticeToastHost } from "@web/components/BottomNoticeStack/BottomNoticeToastHost";
import {
  bottomNoticeStackGateActions,
  useBottomNoticeStackGateStore,
} from "@web/components/BottomNoticeStack/bottom-notice-stack-gate.store";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

function GateHarness() {
  const [suppressed, setSuppressed] = useState(true);
  return (
    <HotkeysProvider>
      <button onClick={() => setSuppressed(false)} type="button">
        Release notices
      </button>
      <BottomNoticeStack suppressed={suppressed}>
        <p>Stack card</p>
      </BottomNoticeStack>
    </HotkeysProvider>
  );
}

describe("BottomNoticeStack gate", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    HotkeyManager.resetInstance();
    bottomNoticeStackGateActions.resetForTests();
    registerToastPort(port);
  });

  afterEach(() => {
    bottomNoticeStackGateActions.resetForTests();
  });

  it("queues the app update toast while suppressed and delivers it after release", async () => {
    bottomNoticeStackGateActions.setSuppressed(true);

    showAppUpdateAvailableToast("99.0.0");
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(useBottomNoticeStackGateStore.getState().queue).toHaveLength(1);

    function ReleaseHarness() {
      return (
        <BottomNoticeStack suppressed={false}>
          <BottomNoticeToastHost />
        </BottomNoticeStack>
      );
    }

    render(
      <HotkeysProvider>
        <ReleaseHarness />
      </HotkeysProvider>,
    );

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledTimes(1);
    });
    expect(useBottomNoticeStackGateStore.getState().queue).toHaveLength(0);
  });

  it("hides stack children while suppressed and restores them after release", async () => {
    const user = userEvent.setup();
    render(<GateHarness />);

    expect(screen.queryByText("Stack card")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Release notices" }));

    await waitFor(() => {
      expect(screen.getByText("Stack card")).toBeInTheDocument();
    });
  });
});
