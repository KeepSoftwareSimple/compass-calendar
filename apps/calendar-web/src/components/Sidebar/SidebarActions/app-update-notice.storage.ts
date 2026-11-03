import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";

const readHandledVersions = (): ReadonlySet<string> => {
  if (!persistentBrowserStore.isAvailable()) return new Set();

  const raw = persistentBrowserStore.get(
    STORAGE_KEYS.APP_UPDATE_NOTICE_HANDLED_VERSIONS,
  );
  if (!raw) return new Set();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((entry): entry is string => typeof entry === "string"),
    );
  } catch {
    return new Set();
  }
};

export function isAppUpdateNoticeHandled(version: string): boolean {
  return readHandledVersions().has(version);
}

export function markAppUpdateNoticeHandled(version: string): void {
  if (!persistentBrowserStore.isAvailable()) return;

  const next = new Set(readHandledVersions());
  next.add(version);
  persistentBrowserStore.set(
    STORAGE_KEYS.APP_UPDATE_NOTICE_HANDLED_VERSIONS,
    JSON.stringify([...next]),
  );
}

export function resetAppUpdateNoticeStorageForTests(): void {
  persistentBrowserStore.remove(
    STORAGE_KEYS.APP_UPDATE_NOTICE_HANDLED_VERSIONS,
  );
}
