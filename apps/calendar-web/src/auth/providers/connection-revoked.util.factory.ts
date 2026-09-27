import { type toast } from "react-toastify";
import { Status } from "@core/errors/status.codes";
import { type ApiError } from "@web/api/api.types";
import { type GoogleReconnectTarget } from "@web/auth/providers/reconnect.state";
import { getToastDefaultOptions } from "@web/common/constants/toast.constants";

export interface SyncLocalEventsResult {
  syncedCount: number;
  success: boolean;
  error?: Error;
}

export const LOCAL_EVENTS_SYNC_ERROR_MESSAGE =
  "We couldn't save your events to the cloud. Your changes are still safe on this device.";
export const LOCAL_EVENTS_SYNC_SESSION_EXPIRED_MESSAGE =
  "You were signed out before Compass could save your events to the cloud. Sign in again to finish. Your changes are still safe on this device.";

export type GoogleRevokedContext = {
  calendarId?: string | null;
  connectionId?: string | null;
  accountEmail?: string | null;
};
export type ConnectionRevokedContext = GoogleRevokedContext;

type GoogleAuthUtilDependencies = {
  closeStream: () => void;
  openStream: () => void;
  refreshUserMetadata: () => void;
  resolveRevokedAccount: (
    context?: GoogleRevokedContext,
  ) => GoogleReconnectTarget | null;
  markAccountReconnectRequired: (target: GoogleReconnectTarget) => void;
  showReconnectToast: (target?: GoogleReconnectTarget) => void;
  syncLocalEventsToCloud: () => Promise<number>;
  toastError: typeof toast.error;
};

const getApiErrorStatus = (error: Error | undefined): number | undefined =>
  (error as ApiError | undefined)?.response?.status;

export function createGoogleAuthUtil({
  closeStream,
  openStream,
  refreshUserMetadata,
  resolveRevokedAccount,
  markAccountReconnectRequired,
  showReconnectToast,
  syncLocalEventsToCloud,
  toastError,
}: GoogleAuthUtilDependencies) {
  const handleGoogleRevoked = (context?: GoogleRevokedContext) => {
    const target = resolveRevokedAccount(context);
    if (target) {
      // Only sticky-mark when we know which account died — inventing a
      // primary override on multi-account can brick a healthy sibling.
      markAccountReconnectRequired(target);
      showReconnectToast(target);
    }

    // Refresh metadata so Sync's actionRequired row can confirm the account,
    // but keep last-known events and the remote repository so healthy sibling
    // accounts continue CRUD. Named toast lands here for the live revoke
    // interrupt; the calendar banner is the persistent reminder.
    refreshUserMetadata();

    closeStream();
    openStream();
  };

  const showLocalEventsSyncFailure = (error: Error | undefined) => {
    const status = getApiErrorStatus(error);
    const message =
      status === Status.UNAUTHORIZED
        ? LOCAL_EVENTS_SYNC_SESSION_EXPIRED_MESSAGE
        : LOCAL_EVENTS_SYNC_ERROR_MESSAGE;

    toastError(message, getToastDefaultOptions());
    console.error(error);
  };

  const syncLocalEvents = async (): Promise<SyncLocalEventsResult> => {
    try {
      const syncedCount = await syncLocalEventsToCloud();
      return { syncedCount, success: true };
    } catch (error) {
      return { syncedCount: 0, success: false, error: error as Error };
    }
  };

  const syncPendingLocalEvents = async (): Promise<boolean> => {
    const syncResult = await syncLocalEvents();

    if (!syncResult.success) {
      showLocalEventsSyncFailure(syncResult.error);
      return false;
    }

    return true;
  };

  return {
    handleGoogleRevoked,
    showLocalEventsSyncFailure,
    syncLocalEvents,
    syncPendingLocalEvents,
  };
}
