import { useEffect } from "react";
import {
  isWriteLockedAccess,
  setBillingWriteLock,
} from "@web/billing/billing-write-lock";
import {
  selectIsCelebrating,
  useCheckoutCelebrationStore,
} from "@web/billing/checkout-celebration.store";
import { useAppAccess } from "@web/billing/useAppAccess";

/**
 * True while a signed-in account cannot write (awaiting checkout, expired,
 * canceled) and the checkout celebration is not covering the screen.
 */
export function useShortcutWriteLocked(): boolean {
  const access = useAppAccess();
  const isCelebrating = useCheckoutCelebrationStore(selectIsCelebrating);
  return isWriteLockedAccess(access) && !isCelebrating;
}

/**
 * Mirrors read-only billing onto a module flag that keyboard handlers can
 * read without subscribing. Mount once from RootShell.
 *
 * Kept off the `useAppShortcut` import graph: pulling `useAppAccess` into
 * that hot path evaluated `AppConfigApi` before it finished initializing.
 */
export function useSyncBillingWriteLock(): void {
  const access = useAppAccess();
  const isCelebrating = useCheckoutCelebrationStore(selectIsCelebrating);
  const locked = isWriteLockedAccess(access) && !isCelebrating;
  const status = access.kind === "server" ? access.status : null;

  useEffect(() => {
    setBillingWriteLock({ locked, status });
    return () => setBillingWriteLock({ locked: false, status: null });
  }, [locked, status]);
}
