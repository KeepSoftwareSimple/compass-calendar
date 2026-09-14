export type StorageFailureKind = "quota" | "blocked" | "unavailable";

const QUOTA_NAMES = new Set([
  "QuotaExceededError",
  "NS_ERROR_DOM_QUOTA_REACHED",
]);
const BLOCKED_NAMES = new Set(["SecurityError"]);

function errorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "";
}

function innerError(error: unknown): unknown {
  if (error && typeof error === "object" && "inner" in error) {
    return (error as { inner: unknown }).inner;
  }
  return undefined;
}

export function classifyStorageFailure(error: unknown): StorageFailureKind {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current !== undefined && current !== null && !seen.has(current)) {
    seen.add(current);
    const name = errorName(current);
    if (QUOTA_NAMES.has(name)) return "quota";
    if (BLOCKED_NAMES.has(name)) return "blocked";
    current = innerError(current);
  }

  return "unavailable";
}

export function storageInitUserMessage(kind: StorageFailureKind): string {
  if (kind === "quota") return "this device is out of storage";
  if (kind === "blocked") return "the browser blocked local storage";
  return "local storage could not be opened";
}

export function storageWriteUserMessage(kind: StorageFailureKind): string {
  const detail =
    kind === "unavailable"
      ? "local storage is unavailable"
      : storageInitUserMessage(kind);
  return `Couldn't save, ${detail}. Your change was not applied.`;
}

export function isStorageWriteFailure(error: unknown): boolean {
  if (classifyStorageFailure(error) !== "unavailable") return true;
  const name = errorName(error);
  return name === "DatabaseClosedError" || name === "InvalidStateError";
}
