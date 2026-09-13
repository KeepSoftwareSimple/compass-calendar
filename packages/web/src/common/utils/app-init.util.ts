import { getPosthogClient } from "@web/auth/posthog/posthog.bootstrap";
import { DB_INIT_ERROR_TOAST_ID } from "@web/common/constants/toast.constants";
import { initializeOfflineDataStore } from "@web/common/storage/offline-data/offline-data.store.registry";
import {
  classifyStorageFailure,
  storageInitUserMessage,
} from "@web/common/storage/storage-failure.util";
import { getToast } from "@web/common/utils/toast/toast.port";

export class DatabaseInitError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DatabaseInitError";
  }
}

export interface AppInitResult {
  dbInitError: DatabaseInitError | null;
}

export function toDatabaseInitError(error: unknown): DatabaseInitError {
  if (error instanceof DatabaseInitError) return error;
  return new DatabaseInitError(
    storageInitUserMessage(classifyStorageFailure(error)),
    error,
  );
}

function reportStorageInitFailure(error: DatabaseInitError): void {
  getPosthogClient()?.captureException(error, {
    $exception_handled: true,
    $exception_source: "storage-init",
    storageFailure: classifyStorageFailure(error.cause ?? error),
  });
}

/** Initialize offline storage; return any init error so the app can keep running. */
export async function initializeDatabaseWithErrorHandling(
  initialize: typeof initializeOfflineDataStore = initializeOfflineDataStore,
): Promise<AppInitResult> {
  try {
    await initialize();
    return { dbInitError: null };
  } catch (error) {
    const dbInitError = toDatabaseInitError(error);
    reportStorageInitFailure(dbInitError);
    // Continue without local storage — authenticated users can use remote-only mode
    return { dbInitError };
  }
}

/**
 * Defer toast until after the next paint so ToastContainer from `root.render`
 * has mounted. Double rAF waits for commit + paint without an arbitrary delay.
 */
export function showDbInitErrorToast(dbInitError: DatabaseInitError): void {
  const show = () => {
    const toast = getToast();
    if (toast.isActive?.(DB_INIT_ERROR_TOAST_ID)) return;
    toast.error(
      `Compass can't use offline storage right now: ${dbInitError.message}. Your changes won't be saved on this device.`,
      {
        autoClose: false,
        position: "bottom-right",
        toastId: DB_INIT_ERROR_TOAST_ID,
      },
    );
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(show);
  });
}
