import { type FC } from "react";
import {
  SYNC_STATUS_VARIANT_CLASSNAME,
  type SyncStatus,
} from "./sync-status.types";

interface SyncStatusLineProps {
  status: SyncStatus;
  /** Extra classes (e.g. spacing) layered onto the shared status styling. */
  className?: string;
}

/**
 * One account's live sync status line - used by the Settings modal's account
 * rows (the sidebar surfaces this same status text in the pinned
 * SidebarStatusBar instead, so an account's status appearing/disappearing
 * can never shift the calendar list below it). Renders nothing when there's
 * no status to show (e.g. NOT_CONNECTED).
 */
export const SyncStatusLine: FC<SyncStatusLineProps> = ({
  status,
  className,
}) => {
  if (!status) return null;

  return (
    <p
      aria-live="polite"
      className={`text-xs ${SYNC_STATUS_VARIANT_CLASSNAME[status.variant]} ${className ?? ""}`}
      role="status"
    >
      {status.text}
    </p>
  );
};
