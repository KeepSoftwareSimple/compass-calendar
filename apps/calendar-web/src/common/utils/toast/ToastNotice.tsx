import { type ReactNode } from "react";
import { ToastDismissHint } from "@web/common/utils/toast/ToastDismissHint";

/** Shared action-toast layout: body, then how to dismiss with Escape. */
export function ToastNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-2 text-text" data-notice="">
      {children}
      <ToastDismissHint />
    </div>
  );
}
