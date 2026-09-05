import classNames from "classnames";
import { type FC, useMemo } from "react";
import { useUser } from "@web/auth/compass/user/hooks/useUser";
import { ConnectProviderChooser } from "@web/auth/providers/ConnectProviderChooser";
import {
  CALENDAR_HOST_EXPLAINER,
  CONNECT_THE_CALENDAR_YOU_USE,
} from "@web/auth/providers/provider-copy.util";
import { useAvailableConnectProviders } from "@web/auth/providers/useAvailableConnectProviders";
import {
  selectSyncConnections,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import { useAccountHeaderStatus } from "./useAccountHeaderStatus";

const HEADING_CLASSNAME =
  "flex min-w-0 flex-1 font-semibold text-sm leading-none";

const CONNECT_ACTION_BUTTON_CLASSNAME =
  "c-button-compact c-button-primary mb-2 w-full rounded-xs px-2 py-1.5 text-left text-xs";

/**
 * The heading shown before any account section exists for a signed-in user:
 * the email with the connect-your-first-calendar CTA. Once calendars arrive
 * each account gets its own AccountSectionHeader instead, which is why this
 * one carries no collapse toggle. Anonymous users get an AnonymousCalendarRow
 * instead of a heading.
 */
export const CalendarListHeader: FC = () => {
  const { email } = useUser();
  if (!email) {
    return null;
  }

  return <CalendarListHeaderContent email={email} />;
};

const CalendarListHeaderContent: FC<{ email: string }> = ({ email }) => {
  // Metadata and the calendar list load a moment apart, so a connected user
  // can briefly land here. Show THIS email's own status, not sync's
  // precedence-winning "most actionable connection across everyone", or a
  // second account's problem flashes under the first account's name for as
  // long as that gap lasts (2026-08-04, caught disconnecting one of two live
  // accounts).
  const connections = useUserMetadataStore(selectSyncConnections);
  const availableProviders = useAvailableConnectProviders();
  const ownConnection = useMemo(
    () => connections.find((c) => c.accountEmail === email) ?? null,
    [connections, email],
  );
  const {
    actionLabel,
    commandAction,
    isAvailable,
    isConnecting,
    isRefreshing,
    state,
    syncStatus,
  } = useAccountHeaderStatus(ownConnection);

  const showChooser =
    state === "NOT_CONNECTED" && availableProviders.length > 0;

  return (
    <>
      <h2 className={classNames(HEADING_CLASSNAME, "mb-2")}>
        <span
          className={classNames(
            "min-w-0 truncate",
            syncStatus?.variant === "syncing"
              ? "c-sync-text-wave"
              : "text-text-muted",
          )}
          translate="no"
        >
          {email}
        </span>
      </h2>
      {showChooser ? (
        <>
          <ConnectProviderChooser
            idleLabel={
              availableProviders.length > 1
                ? CONNECT_THE_CALENDAR_YOU_USE
                : (commandAction?.label ?? "Connect calendar")
            }
            variant="sidebar-primary"
          />
          {availableProviders.length > 1 ? (
            <p className="mb-2 text-text-muted text-xs">
              {CALENDAR_HOST_EXPLAINER}
            </p>
          ) : null}
        </>
      ) : isAvailable && commandAction != null && actionLabel != null ? (
        <button
          aria-busy={isConnecting || isRefreshing || undefined}
          className={CONNECT_ACTION_BUTTON_CLASSNAME}
          disabled={isConnecting || isRefreshing}
          onClick={commandAction.onSelect}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </>
  );
};
