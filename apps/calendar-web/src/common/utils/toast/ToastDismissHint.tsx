import { useSyncExternalStore } from "react";
import { subscribeAppLock } from "@web/shortcuts/app-lock";
import { isHigherEscapeOwner } from "@web/shortcuts/escape-ownership";
import { subscribeFloatingLayer } from "@web/shortcuts/floating-layer";
import { ShortcutTipParts } from "@web/shortcuts/tips/ShortcutTipParts";

const DISMISS_TIP_PARTS = ["Press ", { key: "Esc" }, " to dismiss"] as const;

const subscribeEscapeOwners = (onStoreChange: () => void) => {
  const unsubLock = subscribeAppLock(onStoreChange);
  const unsubFloat = subscribeFloatingLayer(onStoreChange);
  return () => {
    unsubLock();
    unsubFloat();
  };
};

/** Footer tip so Escape-to-dismiss is visible without a close control. */
export function ToastDismissHint() {
  const hide = useSyncExternalStore(
    subscribeEscapeOwners,
    isHigherEscapeOwner,
    () => false,
  );
  if (hide) return null;

  return (
    <p className="text-text-muted text-xs" role="note">
      <ShortcutTipParts parts={DISMISS_TIP_PARTS} />
    </p>
  );
}
