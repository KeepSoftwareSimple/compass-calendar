import { useCallback, useRef, useState } from "react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";

/** Two short account rows: a fair guess before this browser has measured. */
export const DEFAULT_CALENDAR_LIST_HEIGHT_PX = 64;

const readStoredHeight = (): number => {
  const stored = Number(
    persistentBrowserStore.get(STORAGE_KEYS.CALENDAR_LIST_HEIGHT),
  );
  return Number.isFinite(stored) && stored > 0
    ? stored
    : DEFAULT_CALENDAR_LIST_HEIGHT_PX;
};

/**
 * Remembers how tall the calendar list body last rendered, so the loading
 * skeleton can hold the same space and the notices below it stay put.
 */
export function useCalendarListHeight() {
  const [skeletonHeight] = useState(readStoredHeight);
  const observerRef = useRef<ResizeObserver | null>(null);

  const measureRef = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const height = Math.round(node.getBoundingClientRect().height);
      if (height <= 0) return;
      persistentBrowserStore.set(
        STORAGE_KEYS.CALENDAR_LIST_HEIGHT,
        String(height),
      );
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  return { skeletonHeight, measureRef };
}
