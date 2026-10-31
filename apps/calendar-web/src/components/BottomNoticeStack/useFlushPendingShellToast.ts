import { useEffect } from "react";
import { flushPendingShellToast } from "@web/common/utils/toast/pending-shell-toast";

/** Delivers OAuth and shell toasts once the bottom notice toast host is mounted. */
export function useFlushPendingShellToast(): void {
  useEffect(() => {
    flushPendingShellToast();
  }, []);
}
