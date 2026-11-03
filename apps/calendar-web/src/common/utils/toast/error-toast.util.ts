import { type Id, type ToastContent, type ToastOptions } from "react-toastify";
import { getToastDefaultOptions } from "@web/common/constants/toast.constants";
import { getToast } from "@web/common/utils/toast/toast.port";

export enum ErrorToastSeverity {
  DEFAULT = "default",
  CRITICAL = "critical",
}

export interface ErrorToastConfig {
  toastId?: Id;
  severity?: ErrorToastSeverity;
  options?: ToastOptions;
}

const criticalErrorToastOptions: ToastOptions = {
  autoClose: false,
  closeOnClick: false,
  draggable: false,
};

export function showErrorToast(
  message: ToastContent,
  config: ErrorToastConfig = {},
): Id {
  const toast = getToast();
  const { toastId, severity = ErrorToastSeverity.DEFAULT, options } = config;

  if (toastId && toast.isActive?.(toastId)) {
    return toastId;
  }

  const severityOptions =
    severity === ErrorToastSeverity.CRITICAL ? criticalErrorToastOptions : {};

  return toast.error(message, {
    ...getToastDefaultOptions(),
    ...severityOptions,
    ...options,
    ...(toastId ? { toastId } : {}),
  });
}
