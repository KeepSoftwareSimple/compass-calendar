import { type Id } from "react-toastify";
import { getToastDefaultOptions } from "@web/common/constants/toast.constants";
import { getToast } from "@web/common/utils/toast/toast.port";

export type PendingShellToast = {
  variant: "info" | "error";
  message: string;
  toastId?: Id;
  autoClose?: false;
};

let pendingShellToast: PendingShellToast | null = null;
let pendingShellToastClearTimer: ReturnType<typeof setTimeout> | null = null;

function readPendingShellToast(): PendingShellToast | null {
  return pendingShellToast;
}

function schedulePendingShellToastClear(pending: PendingShellToast) {
  const serialized = JSON.stringify(pending);
  if (pendingShellToastClearTimer) {
    clearTimeout(pendingShellToastClearTimer);
  }

  pendingShellToastClearTimer = setTimeout(() => {
    if (pendingShellToast && JSON.stringify(pendingShellToast) === serialized) {
      pendingShellToast = null;
    }
    pendingShellToastClearTimer = null;
  }, 750);
}

function deliverPendingShellToast(pending: PendingShellToast): void {
  const toast = getToast();
  const options = {
    ...getToastDefaultOptions(),
    ...(pending.toastId ? { toastId: pending.toastId } : {}),
    ...(pending.autoClose === false
      ? { autoClose: false as const, closeOnClick: false, draggable: false }
      : {}),
  };

  if (pending.variant === "info") {
    toast.info(pending.message, options);
    return;
  }

  toast.error(pending.message, options);
}

function isPendingShellToastVisible(pending: PendingShellToast): boolean {
  if (typeof document === "undefined") return false;

  for (const toast of document.querySelectorAll(".Toastify__toast")) {
    if (toast.textContent?.includes(pending.message)) {
      return true;
    }
  }

  return false;
}

/** Queue a toast until {@link flushPendingShellToast} runs on the calendar shell. */
export function queuePendingShellToast(pending: PendingShellToast): void {
  if (typeof window === "undefined") {
    deliverPendingShellToast(pending);
    return;
  }

  pendingShellToast = pending;
}

/** Show any toast queued during a route without {@link BottomNoticeToastHost}. */
export function flushPendingShellToast(): void {
  const pending = readPendingShellToast();
  if (!pending) return;

  if (!isPendingShellToastVisible(pending)) {
    deliverPendingShellToast(pending);
  }
  // React StrictMode remounts the calendar shell immediately after the first
  // flush, which tears down react-toastify before the toast paints. Keep the
  // payload briefly so the remounted host can show it again.
  schedulePendingShellToastClear(pending);
}

export function resetPendingShellToastForTests(): void {
  pendingShellToast = null;
  if (pendingShellToastClearTimer) {
    clearTimeout(pendingShellToastClearTimer);
    pendingShellToastClearTimer = null;
  }
}
