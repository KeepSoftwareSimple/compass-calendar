import { type Id, type ToastContent, type ToastOptions } from "react-toastify";
import {
  getToast,
  registerToastPort,
  type ToastApi,
} from "@web/common/utils/toast/toast.port";
import {
  bottomNoticeStackGateActions,
  queuedBottomNoticeToastId,
  selectBottomNoticeStackSuppressed,
  useBottomNoticeStackGateStore,
} from "@web/components/BottomNoticeStack/bottom-notice-stack-gate.store";

let gateInstalled = false;

function gateToastCall(
  deliver: (content: ToastContent, options?: ToastOptions) => Id,
  content: ToastContent,
  options?: ToastOptions,
): Id {
  if (
    selectBottomNoticeStackSuppressed(useBottomNoticeStackGateStore.getState())
  ) {
    bottomNoticeStackGateActions.enqueue({ content, options });
    return queuedBottomNoticeToastId(options);
  }
  return deliver(content, options);
}

function wrapToastApi(base: ToastApi): ToastApi {
  const callable = (content: ToastContent, options?: ToastOptions) =>
    gateToastCall(base, content, options);

  return Object.assign(callable, {
    ...base,
    info: (content: ToastContent, options?: ToastOptions) =>
      gateToastCall(base.info.bind(base), content, options),
    error: (content: ToastContent, options?: ToastOptions) =>
      gateToastCall(base.error.bind(base), content, options),
    success: (content: ToastContent, options?: ToastOptions) =>
      gateToastCall(base.success.bind(base), content, options),
    warning: (content: ToastContent, options?: ToastOptions) =>
      gateToastCall(base.warning.bind(base), content, options),
    warn: (content: ToastContent, options?: ToastOptions) =>
      gateToastCall(base.warn.bind(base), content, options),
  }) as ToastApi;
}

/** Wrap the active toast port so bottom-left notices queue while suppressed. */
export function ensureBottomNoticeStackToastGate(): void {
  if (gateInstalled) return;
  gateInstalled = true;
  registerToastPort({ toast: wrapToastApi(getToast()) });
}

export function flushQueuedBottomNoticeToasts(): void {
  const queue = bottomNoticeStackGateActions.takeQueue();
  if (queue.length === 0) return;
  const toast = getToast();
  for (const item of queue) {
    toast(item.content, item.options);
  }
}

export function resetBottomNoticeStackToastGateForTests(): void {
  gateInstalled = false;
}
