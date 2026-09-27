import { type Id } from "react-toastify";
import { ToastActionButton } from "@web/common/utils/toast/ToastActionButton";
import { ToastNotice } from "@web/common/utils/toast/ToastNotice";
import { getToast } from "@web/common/utils/toast/toast.port";

interface RetryableSaveToastProps {
  message: string;
  toastId: Id;
  onRetry: () => void;
}

// Shown when the backend reported the failure as retryable, which is a
// different situation from a refusal: the same request is expected to work.
// Re-dispatching costs the user one click instead of redoing the edit.
export const RetryableSaveToast = ({
  message,
  toastId,
  onRetry,
}: RetryableSaveToastProps) => {
  const handleRetry = () => {
    getToast().dismiss(toastId);
    onRetry();
  };

  return (
    <ToastNotice>
      <p className="text-sm text-text">{message}</p>
      <ToastActionButton onClick={handleRetry}>Try again</ToastActionButton>
    </ToastNotice>
  );
};
