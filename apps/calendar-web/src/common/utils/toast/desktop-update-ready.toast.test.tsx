import { fireEvent, render, screen } from "@testing-library/react";
import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { DESKTOP_UPDATE_READY_TOAST_ID } from "@web/common/constants/toast.constants";
import {
  DesktopUpdateReadyToast,
  showDesktopUpdateReadyToast,
} from "@web/common/utils/toast/desktop-update-ready.toast";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { beforeEach, describe, expect, it, mock } from "bun:test";

describe("DesktopUpdateReadyToast", () => {
  it("offers a restart and calls back on click", () => {
    const onRestart = mock();
    render(<DesktopUpdateReadyToast onRestart={onRestart} />);

    expect(screen.getByText("A Compass update is ready")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Restart to update/ }));

    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});

describe("showDesktopUpdateReadyToast", () => {
  const { port, mocks } = createTestToastPort();

  beforeEach(() => {
    mocks.toast.mockClear();
    registerToastPort(port);
  });

  it("stays on screen under a fixed id so repeat deliveries dedupe", () => {
    showDesktopUpdateReadyToast(() => {});

    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect((mocks.toast.mock.calls[0] as unknown[])[1]).toMatchObject({
      toastId: DESKTOP_UPDATE_READY_TOAST_ID,
      autoClose: false,
    });
  });
});
