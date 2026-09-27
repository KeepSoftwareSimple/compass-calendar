import { createReasonRegistry } from "@web/shortcuts/reason-registry";

/**
 * Named lock reasons so overlapping overlays (palette + welcome, etc.) can
 * open/close independently without clearing each other's lock. The lock is
 * mirrored onto `document.body.dataset.appLocked`, which is what consumers
 * (and tests) read.
 */
const registry = createReasonRegistry((locked) => {
  if (locked) {
    document.body.dataset.appLocked = "true";
    return;
  }
  delete document.body.dataset.appLocked;
});

export const setAppLockReason = registry.set;

export const hasAppLockReason = registry.has;

/** Sorted names of every reason currently holding the lock. */
export const getAppLockReasons = registry.active;

export const subscribeAppLock = registry.subscribe;

/** Clears every reason — used by tests between cases. */
export const clearAppLockReasons = registry.clear;

export function isAppLocked(): boolean {
  return document.body.dataset.appLocked === "true";
}

export const useAppLockReason = registry.useReason;
