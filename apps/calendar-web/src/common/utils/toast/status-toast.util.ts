import { type ReactNode } from "react";
import { type Id } from "react-toastify";
import { getToastDefaultOptions } from "@web/common/constants/toast.constants";
import { getToast } from "@web/common/utils/toast/toast.port";

/**
 * Show a lightweight, self-dismissing status toast (no close button, no
 * progress bar). The fixed toastId makes react-toastify dedupe rapid calls
 * into a single toast; the unconditional update refreshes the message and
 * autoClose timer when the toast already exists (and is a no-op otherwise).
 * Branching on `toast.isActive` instead would race: it stays false for
 * toasts created earlier in the same tick.
 */
export function showStatusToast(toastId: Id, message: ReactNode): void {
  const toast = getToast();
  const options = getToastDefaultOptions();
  toast(message, {
    ...options,
    toastId,
    closeButton: false,
    hideProgressBar: true,
  });
  toast.update(toastId, {
    render: message,
    autoClose: options.autoClose,
  });
}
