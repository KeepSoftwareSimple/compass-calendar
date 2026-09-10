import { IS_DEV } from "@backend/common/constants/config.constants";

export const Collections = {
  BILLING_EVENT: IS_DEV ? "_dev.billingEvent" : "billingEvent",
  CALENDAR: IS_DEV ? "_dev.calendar" : "calendar",
  EVENT: IS_DEV ? "_dev.event" : "event",
  OAUTH: IS_DEV ? "_dev.oauth" : "oauth",
  PENDING_ACCOUNT_DELETION: IS_DEV
    ? "_dev.pendingAccountDeletion"
    : "pendingAccountDeletion",
  LEGACY_PENDING_SYNC_PRINCIPAL_DELETION: IS_DEV
    ? "_dev.pendingSyncPrincipalDeletion"
    : "pendingSyncPrincipalDeletion",
  BOOKING_PAGE: IS_DEV ? "_dev.bookingPage" : "bookingPage",
  BOOKING_RESERVATION: IS_DEV
    ? "_dev.bookingReservation"
    : "bookingReservation",
  HIDDEN_EVENT: IS_DEV ? "_dev.hiddenEvent" : "hiddenEvent",
  USER: IS_DEV ? "_dev.user" : "user",
};
