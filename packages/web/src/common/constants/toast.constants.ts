import { type CSSProperties } from "react";
import { type Id, type ToastOptions } from "react-toastify";
import { type ThemeName } from "@web/settings/theme/theme.constants";
import { useThemeStore } from "@web/settings/theme/theme.store";

export const EVENT_DELETED_TOAST_ID: Id = "event-deleted";
export const UNDO_DECLINED_TOAST_ID: Id = "undo-declined";
export const GENERIC_ERROR_TOAST_ID: Id = "generic-error";
export const GOOGLE_REVOKED_TOAST_ID: Id = "google-revoked-api";
export const GOOGLE_REPAIR_FAILED_TOAST_ID: Id = "google-repair-failed";
export const GOOGLE_CONNECT_FAILED_TOAST_ID: Id = "google-connect-failed";
export const GOOGLE_REFRESH_FAILED_TOAST_ID: Id = "google-refresh-failed";
export const GOOGLE_REFRESH_ALREADY_IN_FLIGHT_TOAST_ID: Id =
  "google-refresh-already-in-flight";
export const GOOGLE_DELAYED_TOAST_ID: Id = "google-delayed";
export const ACCOUNT_DISCONNECTED_TOAST_ID: Id = "account-disconnected";
export const EXPORT_MY_DATA_TOAST_ID: Id = "export-my-data";
export const LOGGED_OUT_TOAST_ID: Id = "logged-out";
export const EVENT_SAVE_UNAVAILABLE_TOAST_ID: Id = "event-save-unavailable";
export const EVENT_SAVE_RETRYABLE_TOAST_ID: Id = "event-save-retryable";
export const NOTIFICATIONS_STATUS_TOAST_ID: Id = "notifications-status";
export const BILLING_SUBSCRIBED_TOAST_ID: Id = "billing-subscribed";
export const BILLING_PLAN_ENDS_TOAST_ID: Id = "billing-plan-ends";
export const BILLING_PLAN_RENEWS_TOAST_ID: Id = "billing-plan-renews";
export const BILLING_CARD_UPDATED_TOAST_ID: Id = "billing-card-updated";
export const NEW_MEETINGS_TOAST_ID: Id = "new-meetings";

/**
 * Toast chrome follows `[data-theme]` instead of a JS hex snapshot, so body
 * copy that uses `text-text` / `text-text-muted` cannot land on react-toastify's
 * default light (#fff) or dark (#121212) panel.
 */
export const TOAST_CHROME_STYLE: CSSProperties = {
  backgroundColor: "var(--background)",
  color: "var(--text)",
  boxShadow: "0 4px 12px var(--shadow-default)",
};

/** Theme-aware toast defaults. Read the store at call time so toasts match the active palette. */
export function getToastDefaultOptions(
  theme: ThemeName = useThemeStore.getState().theme,
): ToastOptions {
  return {
    autoClose: 5000,
    position: "bottom-left",
    closeButton: false,
    closeOnClick: true,
    theme: theme === "dark-abyss" ? "dark" : "light",
    style: TOAST_CHROME_STYLE,
  };
}
