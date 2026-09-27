import { type BillingSubscriptionStatus } from "@core/types/user.types";
import { type AppAccess } from "@web/billing/useAppAccess";

type BillingWriteLockState = {
  locked: boolean;
  status: BillingSubscriptionStatus | null;
};

const unlocked: BillingWriteLockState = { locked: false, status: null };

let state: BillingWriteLockState = unlocked;

export function isWriteLockedAccess(access: AppAccess): boolean {
  return access.kind === "server" && access.isReadOnly;
}

export function setBillingWriteLock(next: BillingWriteLockState): void {
  state = next;
}

export function isBillingWriteLocked(): boolean {
  return state.locked;
}

export function getBillingWriteLockStatus(): BillingSubscriptionStatus | null {
  return state.status;
}

export function resetBillingWriteLockForTests(): void {
  state = unlocked;
}
