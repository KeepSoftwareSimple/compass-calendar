import { useLayoutEffect } from "react";
import { registerPendingShellToastHost } from "@web/common/utils/toast/pending-shell-toast";

/** Delivers shell toasts before and after the notification host mounts. */
export function useFlushPendingShellToast(): void {
  useLayoutEffect(registerPendingShellToastHost, []);
}
