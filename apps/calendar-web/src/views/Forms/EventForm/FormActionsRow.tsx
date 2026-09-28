import { ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { CalendarX } from "@phosphor-icons/react/dist/csr/CalendarX";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { X } from "@phosphor-icons/react/dist/csr/X";
import type React from "react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { BookingApi } from "@web/api/booking.api";
import { isApiError } from "@web/api/util/api.util";
import { type BookingEventLinks } from "@web/booking/booking-event-links";
import { openExternalUrl } from "@web/common/utils/browser/open-external-url.util";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import IconButton from "@web/components/IconButton/IconButton";
import { TooltipWrapper } from "@web/components/Tooltip/TooltipWrapper";

export const EVENT_FORM_ACTIONS_ID = "event-form-actions";

const BOOKING_CANCEL_TOAST_ID = "booking-cancel-meeting";

export type FormActionsRowHandle = {
  triggerCancelShortcut: () => void;
  triggerRescheduleShortcut: () => void;
  consumeEscapeForCancelConfirm: () => boolean;
};

interface Props {
  /** Unsaved create drafts have nothing persisted to copy. */
  isExistingEvent: boolean;
  /**
   * Read-only events can be inspected but not mutated, so Delete is hidden.
   * Duplicate stays: it creates a new, independent event. Close mutates nothing.
   */
  isReadOnly?: boolean;
  bookingLinks?: BookingEventLinks | null;
  /** Guest display name for the cancel confirmation toast. */
  guestDisplayName?: string;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

type ActionItem = {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  shortcut: string | string[];
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
  onBlur?: () => void;
};

/**
 * Always-visible event-form action row above the title. Sits before the title
 * in the DOM so opening the form still lands on the title; Shift+Tab reaches
 * these actions. Each action is its own tab stop. Mod+0 jumps here.
 */
export const FormActionsRow = forwardRef<FormActionsRowHandle, Props>(
  function FormActionsRow(
    {
      isExistingEvent,
      isReadOnly = false,
      bookingLinks = null,
      guestDisplayName = "Guest",
      onClose,
      onDelete,
      onDuplicate,
    },
    ref,
  ) {
    const [isCancelConfirm, setIsCancelConfirm] = useState(false);
    const isCancelConfirmRef = useRef(false);
    const cancelButtonRef = useRef<HTMLButtonElement>(null);
    const showBookingActions = !isReadOnly && bookingLinks !== null;

    const revertCancelConfirm = useCallback(() => {
      isCancelConfirmRef.current = false;
      setIsCancelConfirm(false);
    }, []);

    const executeCancel = useCallback(async () => {
      if (!bookingLinks) return;

      try {
        await BookingApi.cancelReservation(bookingLinks.reservationId, {
          token: bookingLinks.token,
        });
        showStatusToast(
          BOOKING_CANCEL_TOAST_ID,
          `Meeting cancelled. ${guestDisplayName} was emailed.`,
        );
        onClose();
      } catch (error) {
        if (
          isApiError(error) &&
          (error.response?.status === 404 || error.response?.status === 409)
        ) {
          showStatusToast(
            BOOKING_CANCEL_TOAST_ID,
            "This meeting was already cancelled.",
          );
          onClose();
          return;
        }
        throw error;
      } finally {
        isCancelConfirmRef.current = false;
        setIsCancelConfirm(false);
      }
    }, [bookingLinks, guestDisplayName, onClose]);

    const enterCancelConfirm = useCallback(() => {
      isCancelConfirmRef.current = true;
      setIsCancelConfirm(true);
    }, []);

    const onCancelClick = useCallback(() => {
      if (!isCancelConfirmRef.current) {
        enterCancelConfirm();
        return;
      }
      void executeCancel();
    }, [enterCancelConfirm, executeCancel]);

    const triggerCancelShortcut = useCallback(() => {
      if (!showBookingActions) return;
      if (!isCancelConfirmRef.current) {
        enterCancelConfirm();
        return;
      }
      void executeCancel();
    }, [enterCancelConfirm, executeCancel, showBookingActions]);

    const triggerRescheduleShortcut = useCallback(() => {
      if (!showBookingActions || !bookingLinks) return;
      openExternalUrl(bookingLinks.rescheduleUrl);
    }, [bookingLinks, showBookingActions]);

    const consumeEscapeForCancelConfirm = useCallback(() => {
      if (!isCancelConfirmRef.current) return false;
      revertCancelConfirm();
      return true;
    }, [revertCancelConfirm]);

    useImperativeHandle(
      ref,
      () => ({
        triggerCancelShortcut,
        triggerRescheduleShortcut,
        consumeEscapeForCancelConfirm,
      }),
      [
        consumeEscapeForCancelConfirm,
        triggerCancelShortcut,
        triggerRescheduleShortcut,
      ],
    );

    useEffect(() => {
      if (isCancelConfirm) {
        cancelButtonRef.current?.focus();
      }
    }, [isCancelConfirm]);

    useEffect(() => {
      if (!showBookingActions) {
        isCancelConfirmRef.current = false;
        setIsCancelConfirm(false);
      }
    }, [showBookingActions]);

    const items: ActionItem[] = [];
    if (isExistingEvent) {
      items.push({
        icon: <Copy size={18} />,
        label: "Duplicate",
        onClick: onDuplicate,
        shortcut: ["Mod", "D"],
      });
    }
    if (showBookingActions && bookingLinks) {
      items.push({
        icon: <CalendarX size={18} />,
        label: isCancelConfirm ? "Confirm cancel" : "Cancel meeting",
        onClick: onCancelClick,
        shortcut: ["Mod", "Shift", "X"],
        buttonRef: cancelButtonRef,
        onBlur: revertCancelConfirm,
      });
      items.push({
        icon: <ArrowsClockwise size={18} />,
        label: "Reschedule",
        onClick: () => openExternalUrl(bookingLinks.rescheduleUrl),
        shortcut: ["Mod", "Shift", "E"],
      });
    }
    if (!isReadOnly) {
      items.push({
        icon: <Trash size={18} />,
        label: "Delete",
        onClick: onDelete,
        shortcut: "Delete",
      });
    }
    items.push({
      icon: <X size={18} />,
      label: "Close",
      onClick: onClose,
      shortcut: "Esc",
    });

    return (
      // biome-ignore lint/a11y/useSemanticElements: fieldset's min-inline-size breaks the flex row; role="group" is the accessible equivalent
      <div
        aria-label="Event actions"
        className="flex items-center justify-end gap-1"
        id={EVENT_FORM_ACTIONS_ID}
        role="group"
      >
        {items.map((item) => (
          <TooltipWrapper
            key={item.label}
            description={item.label}
            shortcut={item.shortcut}
          >
            <IconButton
              ref={item.buttonRef}
              aria-label={item.label}
              onBlur={item.onBlur}
              onClick={item.onClick}
              size="small"
            >
              {item.icon}
            </IconButton>
          </TooltipWrapper>
        ))}
      </div>
    );
  },
);
