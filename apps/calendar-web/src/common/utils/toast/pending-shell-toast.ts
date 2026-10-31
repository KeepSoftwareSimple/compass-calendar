import { getToastDefaultOptions } from "@web/common/constants/toast.constants";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";
import { getToast } from "@web/common/utils/toast/toast.port";

const SESSION_KEY = "compass.shell.pending-toast";

export type PendingShellToast =
  | { variant: "info"; message: string }
  | { variant: "error"; message: string };

function readPendingShellToast(): PendingShellToast | null {
  if (typeof sessionStorage === "undefined") return null;

  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;

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

  sessionStorage.removeItem(SESSION_KEY);
  return null;
}

function deliverPendingShellToast(pending: PendingShellToast): void {
  if (pending.variant === "info") {
    getToast().info(pending.message, getToastDefaultOptions());
    return;
  }

  showErrorToast(pending.message);
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
  if (!pending) return;

  sessionStorage.removeItem(SESSION_KEY);
  deliverPendingShellToast(pending);
}

export function resetPendingShellToastForTests(): void {
  sessionStorage.removeItem(SESSION_KEY);
}
