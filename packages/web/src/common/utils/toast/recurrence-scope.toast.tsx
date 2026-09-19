import { type ReactNode } from "react";
import { type Id } from "react-toastify";
import {
  EVENT_DELETED_TOAST_ID,
  getToastDefaultOptions,
} from "@web/common/constants/toast.constants";
import { getToast } from "@web/common/utils/toast/toast.port";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { type RecurrenceScopePromotion } from "@web/events/recurrence/recurrence-scope";
import {
  type RecurrenceScopeOpportunity,
  recurrenceScopeOpportunityActions,
  useRecurrenceScopeOpportunityStore,
} from "@web/events/recurrence/recurrence-scope-opportunity.store";

export const RECURRENCE_SCOPE_TOAST_ID = "recurrence-scope-opportunity";

const MAX_EVENT_NAME_LENGTH = 28;

const actionClassName =
  "flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm font-medium text-text hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

const truncateEventName = (title: string) => {
  const name = title.trim() || "Untitled event";
  if (name.length <= MAX_EVENT_NAME_LENGTH) return name;

  const truncated = name.slice(0, MAX_EVENT_NAME_LENGTH + 1);
  const boundary = truncated.lastIndexOf(" ");
  const visible =
    boundary > MAX_EVENT_NAME_LENGTH / 2
      ? truncated.slice(0, boundary)
      : name.slice(0, MAX_EVENT_NAME_LENGTH);
  return `${visible.trimEnd()}…`;
};

const eventNameForToast = (opportunity: RecurrenceScopeOpportunity) => {
  const content =
    opportunity.kind === "replace"
      ? opportunity.input.content
      : opportunity.original.content;
  return truncateEventName(content.kind === "details" ? content.title : "");
};

function ScopeToastContent({
  opportunity,
}: {
  opportunity: RecurrenceScopeOpportunity;
}) {
  const verb = opportunity.kind === "delete" ? "Deleted" : "Changed";
  const eventName = eventNameForToast(opportunity);

  return (
    <div className="min-w-0" data-notice="">
      <p title={eventName}>
        {verb} “{eventName}”
      </p>
      <p className="mt-1 text-sm text-text-muted">Apply to series?</p>
      <div className="mt-1 grid gap-1">
        <button
          type="button"
          className={actionClassName}
          onClick={() =>
            recurrenceScopeOpportunityActions.requestPromotion(
              opportunity.id,
              "thisAndFollowing",
            )
          }
        >
          <span>Following</span>
          <ShortcutKeys keys="1" />
        </button>
        <button
          type="button"
          className={actionClassName}
          onClick={() =>
            recurrenceScopeOpportunityActions.requestPromotion(
              opportunity.id,
              "all",
            )
          }
        >
          <span>All</span>
          <ShortcutKeys keys="2" />
        </button>
      </div>
    </div>
  );
}

const toastIdFor = (opportunity: RecurrenceScopeOpportunity): Id =>
  opportunity.kind === "delete"
    ? EVENT_DELETED_TOAST_ID
    : RECURRENCE_SCOPE_TOAST_ID;

const show = (content: ReactNode, toastId: Id, onClose?: () => void) => {
  const toast = getToast();
  toast(content, {
    ...getToastDefaultOptions(),
    toastId,
    closeButton: false,
    closeOnClick: false,
    onClose,
  });
  toast.update(toastId, {
    render: content,
    autoClose: getToastDefaultOptions().autoClose,
    closeButton: false,
    closeOnClick: false,
    onClose,
  });
};

export function showRecurrenceScopeToast(
  opportunity: RecurrenceScopeOpportunity,
): void {
  show(
    <ScopeToastContent opportunity={opportunity} />,
    toastIdFor(opportunity),
    () => {
      recurrenceScopeOpportunityActions.dismiss(opportunity.id);
    },
  );
}

export function showRecurrenceScopePromotionToast(
  opportunity: RecurrenceScopeOpportunity,
): void {
  show("Applying change to the series…", toastIdFor(opportunity));
}

export function showRecurrenceScopeSuccessToast(
  opportunity: RecurrenceScopeOpportunity,
  scope: RecurrenceScopePromotion,
): void {
  if (
    useRecurrenceScopeOpportunityStore.getState().opportunity?.id !==
    opportunity.id
  ) {
    return;
  }
  const verb = opportunity.kind === "delete" ? "Deleted" : "Updated";
  const eventName = eventNameForToast(opportunity);
  const message =
    scope === "all"
      ? `${verb} all events in “${eventName}”`
      : `${verb} “${eventName}” and following`;
  show(<span>{message}</span>, toastIdFor(opportunity));
}

export function dismissRecurrenceScopeToastFor(
  opportunity: RecurrenceScopeOpportunity,
): void {
  getToast().dismiss(toastIdFor(opportunity));
}

export function dismissRecurrenceScopeToast(opportunityId?: number): void {
  const opportunity = useRecurrenceScopeOpportunityStore.getState().opportunity;
  if (
    !opportunity ||
    (opportunityId !== undefined && opportunity.id !== opportunityId)
  ) {
    return;
  }

  dismissRecurrenceScopeToastFor(opportunity);
}
