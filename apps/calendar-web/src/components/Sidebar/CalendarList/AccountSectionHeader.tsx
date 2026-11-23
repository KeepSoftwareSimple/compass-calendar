import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import classNames from "classnames";
import { type FC } from "react";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { ProviderMark } from "@web/auth/providers/ProviderMark";
import { type AccountRef, accountKey } from "@web/calendars/calendar.util";
import {
  accountCalendarListId,
  toggleAccountCollapsed,
  useCollapsedAccountKeys,
} from "@web/calendars/collapsed-accounts.store";
import { pageJumpHintActions } from "@web/shortcuts/page-jump/page-jump.store";
import { calendarAccountJumpId } from "@web/shortcuts/page-jump/page-jump.targets";
import { useAccountHeaderStatus } from "./useAccountHeaderStatus";
/**
 * Heading for one connected account's calendars: the account email (the
 * collapse toggle for its calendar rows, see CalendarList.tsx), that
 * account's own sync status, and its own reconnect/refresh action. The
 * provider mark only appears on hover when the same address is connected on
 * another provider - otherwise the logo next to every unique email is noise.
 * Every connected account gets one, a lone account included - one account
 * and five accounts render the same shape, so the two can't drift apart the
 * way a separate single-account header did.
 *
 * Adding/disconnecting accounts lives in the command palette's "Connect a calendar account" /
 * "Show accounts" items - not a permanent row or icon here, which stayed noisy
 * for accounts with many subcalendars.
 */
export const AccountSectionHeader: FC<{
  account: AccountRef;
  connection: SyncConnectionSummary | undefined;
  showProviderOnHover?: boolean;
}> = ({ account, connection, showProviderOnHover = false }) => {
  const key = accountKey(account);
  const { accountEmail, provider } = account;
  const {
    actionLabel,
    commandAction,
    isAvailable,
    isConnecting,
    isRefreshing,
    syncStatus,
  } = useAccountHeaderStatus(connection);
  const jumpId = calendarAccountJumpId(key);
  const clearHover = () => pageJumpHintActions.setHoveredTarget(null);
  const isCollapsed = useCollapsedAccountKeys().has(key);

  return (
    <div className="mb-1.5">
      <h2 className="mb-0.5 font-semibold text-sm leading-none">
        <button
          aria-controls={accountCalendarListId(key)}
          aria-expanded={!isCollapsed}
          className="c-focus-ring group flex w-full min-w-0 items-center gap-1 rounded-xs text-left"
          onBlur={clearHover}
          onClick={() => toggleAccountCollapsed(key)}
          onMouseEnter={() => pageJumpHintActions.setHoveredTarget(jumpId)}
          onMouseLeave={clearHover}
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
          {showProviderOnHover ? (
            <span className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
              <ProviderMark provider={provider} size={12} />
            </span>
          ) : null}
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
