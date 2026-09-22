import { type SyncConnectionSummary } from "@core/types/user.types";
import { type GoogleUiState } from "@web/auth/providers/connect.types";
import {
  isFirstImportFailed,
  isFirstImportInProgress,
} from "@web/auth/providers/connect.util";

/**
 * Empty-grid first-import overlays. `googleState` alone cannot tell a
 * first-ever import apart from routine catch-up on an established account:
 * both collapse to IMPORTING. Callers pass `queryReady` in their own query
 * terms (week uses `isSuccess`; day uses not-pending and not-load-error).
 */
export function eventGridFirstImportFlags({
  connection,
  googleState,
  hasVisibleEvents,
  queryReady,
}: {
  connection?: SyncConnectionSummary | null;
  googleState: GoogleUiState;
  hasVisibleEvents: boolean;
  queryReady: boolean;
}) {
  const emptyReady = queryReady && !hasVisibleEvents;
  return {
    isImportingEmpty:
      emptyReady &&
      googleState === "IMPORTING" &&
      isFirstImportInProgress(connection),
    isImportFailed: emptyReady && isFirstImportFailed(connection),
  };
}
