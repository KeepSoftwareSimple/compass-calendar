import { useEffect } from "react";

/**
 * A named-reason set: overlapping owners (palette + welcome overlays, nested
 * menus and pickers) set and clear their own reason independently without
 * clobbering each other. Backs both app-lock and floating-layer.
 */
export function createReasonRegistry(onChange?: (anyActive: boolean) => void) {
  const reasons = new Set<string>();
  const listeners = new Set<() => void>();
  const sync = () => {
    onChange?.(reasons.size > 0);
    for (const listener of listeners) listener();
  };

  const set = (reason: string, active: boolean) => {
    if (active) {
      reasons.add(reason);
    } else {
      reasons.delete(reason);
    }
    sync();
  };

  /** Tie a reason to a component's lifecycle; cleared on unmount. */
  function useReason(reason: string, active: boolean) {
    useEffect(() => {
      set(reason, active);
      return () => set(reason, false);
    }, [active, reason]);
  }

  return {
    set,
    /** Clears every reason — used by tests between cases. */
    clear: () => {
      reasons.clear();
      sync();
    },
    isAnyActive: () => reasons.size > 0,
    has: (reason: string) => reasons.has(reason),
    /** Sorted snapshot of the active reasons (stable for telemetry keys). */
    active: () => [...reasons].sort(),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    useReason,
  };
}
