import { createReasonRegistry } from "@web/shortcuts/reason-registry";

/**
 * Named floating-layer reasons so nested Escape owners (menus, listboxes,
 * date pickers) can open/close independently without DOM visibility probes.
 * Escape consumers stand down while any reason is set.
 */
const registry = createReasonRegistry();

export const setFloatingLayerReason = registry.set;

export const subscribeFloatingLayer = registry.subscribe;

/** Clears every reason — used by tests between cases. */
export const clearFloatingLayerReasons = registry.clear;

export const isFloatingLayerOpen = registry.isAnyActive;

export const useFloatingLayer = registry.useReason;
