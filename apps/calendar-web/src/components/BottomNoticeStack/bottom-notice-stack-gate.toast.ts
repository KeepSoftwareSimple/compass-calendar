import { type Id, type ToastContent, type ToastOptions } from "react-toastify";
import { getToast } from "@web/common/utils/toast/toast.port";
import {
  bottomNoticeStackGateActions,
  queuedBottomNoticeToastId,
  selectBottomNoticeStackSuppressed,
  useBottomNoticeStackGateStore,
} from "@web/components/BottomNoticeStack/bottom-notice-stack-gate.store";

/** Queue or deliver a toast that renders in {@link BottomNoticeToastHost}. */
export function deliverOrQueueBottomNoticeToast(
  content: ToastContent,
  options?: ToastOptions,
): Id {
  if (
    selectBottomNoticeStackSuppressed(useBottomNoticeStackGateStore.getState())
  ) {
    bottomNoticeStackGateActions.enqueue({ content, options });
    return queuedBottomNoticeToastId(options);
  }

  const toast = getToast();
  const toastId = options?.toastId;
  if (toastId && toast.isActive?.(toastId)) {
    toast.update(toastId, {
      render: content,
      ...options,
    });
    return toastId;
  }

  return toast(content, options);
}

export function flushQueuedBottomNoticeToasts(): void {
  const queue = bottomNoticeStackGateActions.takeQueue();
  if (queue.length === 0) return;
  const toast = getToast();
  for (const item of queue) {
    toast(item.content, item.options);
  }
}
