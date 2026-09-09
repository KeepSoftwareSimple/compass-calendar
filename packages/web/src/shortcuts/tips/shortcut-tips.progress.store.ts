import { useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import {
  createExternalStore,
  subscribeToStorageKey,
} from "@web/common/utils/external-store.util";
import { useShortcutShowcaseStore } from "@web/components/ShortcutShowcase/showcase.store";
import {
  recordShortcutInvocation,
  type ShortcutInvocationMethod,
} from "@web/shortcuts/tips/shortcut-telemetry";
import { type ShortcutHintId } from "@web/shortcuts/tips/shortcut-tips.data";
import {
  readShortcutHintProgress,
  writeShortcutHintProgress,
} from "@web/shortcuts/tips/shortcut-tips.progress.storage";

const progressStore = createExternalStore<readonly ShortcutHintId[]>(
  readShortcutHintProgress(),
);

function refreshFromStorage(): void {
  progressStore.set(readShortcutHintProgress());
}

function subscribe(onChange: () => void): () => void {
  const unsubscribeStore = progressStore.subscribe(onChange);
  const unsubscribeStorage = subscribeToStorageKey(
    STORAGE_KEYS.SHORTCUT_TIPS_DEMONSTRATED,
    refreshFromStorage,
  );

  return () => {
    unsubscribeStore();
    unsubscribeStorage();
  };
}

export function getShortcutHintProgress(): readonly ShortcutHintId[] {
  return progressStore.get();
}

export function useShortcutHintProgress(): readonly ShortcutHintId[] {
  return useSyncExternalStore(subscribe, progressStore.get);
}

export const shortcutHintProgressActions = {
  /**
   * Records that the user performed a taught primitive. No-ops while the
   * Shortcut Showcase is open so practice does not skip real-calendar tips.
   */
  demonstrate: (
    id: ShortcutHintId,
    invocationMethod: ShortcutInvocationMethod = "keyboard",
  ): void => {
    if (useShortcutShowcaseStore.getState().isActive) return;

    recordShortcutInvocation(id, Date.now(), invocationMethod);

    const current = progressStore.get();
    if (current[current.length - 1] === id) return;

    const next = [...current.filter((existing) => existing !== id), id];
    if (writeShortcutHintProgress(next)) progressStore.set(next);
  },
};

/** Test-only: resyncs the in-memory store from storage. Registered in
 * reset-stores.ts for between-test cleanup. */
export function resetShortcutHintProgressStoreForTests(): void {
  refreshFromStorage();
}
