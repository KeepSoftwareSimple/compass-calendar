import { type Id } from "react-toastify";
import { getToastDefaultOptions } from "@web/common/constants/toast.constants";
import { getToast } from "@web/common/utils/toast/toast.port";

const SESSION_KEY = "compass.shell.pending-toast";

export type PendingShellToast = {
  variant: "info" | "error";
  message: string;
  toastId?: Id;
  autoClose?: false;
};

function parsePendingShellToast(raw: string): PendingShellToast | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "variant" in parsed &&
      "message" in parsed &&
      typeof (parsed as PendingShellToast).message === "string" &&
      ((parsed as PendingShellToast).variant === "info" ||
        (parsed as PendingShellToast).variant === "error")
    ) {
      return parsed as PendingShellToast;
    }
  } catch {
    // ignore malformed payloads
  }

  return null;
}

function readPendingShellToast(): PendingShellToast | null {
  if (typeof sessionStorage === "undefined") return null;

  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  const pending = parsePendingShellToast(raw);
  if (!pending) {
    sessionStorage.removeItem(SESSION_KEY);
  }

  return pending;
}

const pendingShellToastClearTimers = new WeakMap<
  Storage,
  ReturnType<typeof setTimeout>
>();

function schedulePendingShellToastClear(
  storage: Storage,
  pending: PendingShellToast,
) {
  const serialized = JSON.stringify(pending);
  const existing = pendingShellToastClearTimers.get(storage);
  if (existing) clearTimeout(existing);

  pendingShellToastClearTimers.set(
    storage,
    setTimeout(() => {
      if (storage.getItem(SESSION_KEY) === serialized) {
        storage.removeItem(SESSION_KEY);
      }
      pendingShellToastClearTimers.delete(storage);
    }, 750),
  );
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
  if (typeof sessionStorage === "undefined") {
    deliverPendingShellToast(pending);
    return;
  }

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(pending));
}

/** Show any toast queued during a route without {@link BottomNoticeToastHost}. */
export function flushPendingShellToast(): void {
  const pending = readPendingShellToast();
  if (!pending || typeof sessionStorage === "undefined") return;

  if (!isPendingShellToastVisible(pending)) {
    deliverPendingShellToast(pending);
  }
  // React StrictMode remounts the calendar shell immediately after the first
  // flush, which tears down react-toastify before the toast paints. Keep the
  // payload briefly so the remounted host can show it again.
  schedulePendingShellToastClear(sessionStorage, pending);
}

export function resetPendingShellToastForTests(): void {
  sessionStorage.removeItem(SESSION_KEY);
}
