import { createElement } from "react";
import {
  DESKTOP_UPDATE_READY_TOAST_ID,
  getToastDefaultOptions,
} from "@web/common/constants/toast.constants";
import { ToastActionButton } from "@web/common/utils/toast/ToastActionButton";
import { ToastNotice } from "@web/common/utils/toast/ToastNotice";
import { getToast } from "@web/common/utils/toast/toast.port";

/**
 * The macOS shell has staged an update and will install it on quit. The
 * button restarts now instead of waiting for the next quit.
 */
export const DesktopUpdateReadyToast = ({
  onRestart,
}: {
  onRestart: () => void;
}) => (
  <ToastNotice>
    <p className="font-medium text-sm text-text">A Compass update is ready</p>
    <ToastActionButton onClick={onRestart}>Restart to update</ToastActionButton>
  </ToastNotice>
);

export function showDesktopUpdateReadyToast(onRestart: () => void): void {
  getToast()(createElement(DesktopUpdateReadyToast, { onRestart }), {
    ...getToastDefaultOptions(),
    toastId: DESKTOP_UPDATE_READY_TOAST_ID,
    autoClose: false,
  });
}
