import { CaretDownIcon } from "@phosphor-icons/react";
import classNames from "classnames";
import { type FC } from "react";
import { type SyncConnectionSummary } from "@core/types/user.types";
import {
  accountCalendarListId,
  toggleAccountCollapsed,
  useCollapsedAccountKeys,
} from "@web/calendars/collapsed-accounts.store";
import { useAccountHeaderStatus } from "./useAccountHeaderStatus";
/**
 * Heading for one connected account's calendars: the account email (also the
 * collapse toggle for its calendar rows, see CalendarList.tsx), that
 * account's own sync status, and its own reconnect/refresh action. Every
 * connected account gets one, a lone account included - one account and five
 * accounts render the same shape, so the two can't drift apart the way a
 * separate single-account header did.
 *
 * Adding/disconnecting accounts lives in the command palette's "Add account" /
 * "Show accounts" items - not a permanent row or icon here, which stayed noisy
 * for accounts with many subcalendars.
 */
export const AccountSectionHeader: FC<{
  accountEmail: string;
  connection: SyncConnectionSummary | undefined;
}> = ({ accountEmail, connection }) => {
  const {
    actionLabel,
    commandAction,
    isAvailable,
    isConnecting,
    isRefreshing,
    syncStatus,
  } = useAccountHeaderStatus(connection);
  const isCollapsed = useCollapsedAccountKeys().has(accountEmail);

  return (
    <div className="mb-1.5">
      <h2 className="mb-0.5 font-semibold text-sm leading-none">
        <button
          aria-controls={accountCalendarListId(accountEmail)}
          aria-expanded={!isCollapsed}
          className="c-focus-ring group flex w-full min-w-0 items-center gap-1 rounded-xs text-left"
          onClick={() => toggleAccountCollapsed(accountEmail)}
          type="button"
        >
          <CaretDownIcon
            aria-hidden="true"
            className={classNames(
              "shrink-0 transition-transform",
              isCollapsed && "-rotate-90",
            )}
            size={12}
          />
          <span
            className={classNames(
              "min-w-0 truncate",
              syncStatus?.variant === "syncing"
                ? "c-sync-text-wave"
                : "text-text-muted group-hover:text-text",
            )}
            translate="no"
          >
            {accountEmail}
          </span>
        </button>
      </h2>
      {isAvailable && commandAction != null && actionLabel != null ? (
        <button
          aria-busy={isConnecting || isRefreshing || undefined}
          aria-label={`${actionLabel} for ${accountEmail}`}
          className="c-focus-ring mt-1 rounded-xs px-1.5 py-0.5 text-accent text-xs hover:brightness-110 disabled:pointer-events-none disabled:opacity-60"
          disabled={isConnecting || isRefreshing}
          onClick={commandAction.onSelect}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
};
