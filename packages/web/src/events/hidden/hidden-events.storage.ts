import { z } from "zod/v4";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";

const HiddenEventIdsSchema = z.array(z.string().trim().min(1)).readonly();

export function readHiddenEventIds(): readonly string[] {
  const raw = persistentBrowserStore.get(STORAGE_KEYS.HIDDEN_EVENT_IDS);
  if (!raw) return [];

  try {
    return HiddenEventIdsSchema.parse(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeHiddenEventIds(ids: readonly string[]): boolean {
  if (ids.length === 0) {
    return persistentBrowserStore.remove(STORAGE_KEYS.HIDDEN_EVENT_IDS);
  }
  return persistentBrowserStore.set(
    STORAGE_KEYS.HIDDEN_EVENT_IDS,
    JSON.stringify(ids),
  );
}
