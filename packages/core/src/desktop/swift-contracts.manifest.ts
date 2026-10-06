import { type z } from "zod/v4";
import {
  BillingCheckoutResponseSchema,
  BillingStatusResponseSchema,
  BillingSubscriptionResponseSchema,
} from "@core/types/billing.types";
import {
  AdminGetBookingPageResponseSchema,
  AdminGetBookingPageSetupResponseSchema,
  AdminPutBookingPageInputSchema,
  BookingPageSchema,
  BookingPageStatusResponseSchema,
  BookingSlotsResponseSchema,
  PublicGetBookingPageResponseSchema,
} from "@core/types/booking.contracts";
import {
  BookingOperationEventSchema,
  BookingOperationHeartbeatSchema,
} from "@core/types/booking-lifecycle.contracts";
import {
  CalendarListResponseSchema,
  CalendarSchema,
} from "@core/types/calendar.contracts";
import { CompassEventSchema } from "@core/types/compass-event.contracts";
import { AppConfigSchema } from "@core/types/config.types";
import {
  ContactSuggestionSchema,
  ContactSuggestionsResponseSchema,
} from "@core/types/contact.contracts";
import {
  CalendarIdSchema,
  DateOnlySchema,
  DateTimeSchema,
  EventIdSchema,
  TimeZoneSchema,
} from "@core/types/domain-primitives";
import { BusyPeriodSchema, EventSchema } from "@core/types/event.contracts";
import {
  AttendeeSchema,
  ConferenceSchema,
  OrganizerSchema,
} from "@core/types/event-attendance.contracts";
import { EventColorSlotSchema } from "@core/types/event-color.contracts";
import {
  AvailabilityResponseSchema,
  CreateEventInputSchema,
  DeleteEventInputSchema,
  EventListResponseSchema,
  EventMutationErrorSchema,
  EventResponseSchema,
  ReplaceEventInputSchema,
  RsvpEventInputSchema,
} from "@core/types/event-command.contracts";
import {
  HiddenEventIdsResponseSchema,
  SetEventHiddenInputSchema,
} from "@core/types/event-visibility.contracts";
import { ServerMessageSchema } from "@core/types/server-message.contracts";
import {
  ConnectionBeginConnectedResponseSchema,
  ConnectionBeginRedirectResponseSchema,
  ConnectionBeginRequestSchema,
  ConnectionCredentialBrowserRequestSchema,
  ConnectionCredentialResponseSchema,
  ConnectionRefreshResponseSchema,
} from "@core/types/sync/connection.contracts";
import { ConnectionIdSchema } from "@core/types/sync/identity.contracts";
import {
  UserMetadataSchema,
  UserProfileSchema,
} from "@core/types/user.profile.contracts";

export type SwiftBrandedIdEntry = {
  swiftName: string;
  schema: z.ZodType<string>;
};

export type SwiftContractManifestEntry = {
  swiftName: string;
  schema: z.ZodType;
};

/** Branded string ids emitted as RawRepresentable structs. */
export const SWIFT_BRANDED_ID_ENTRIES: SwiftBrandedIdEntry[] = [
  { swiftName: "EventId", schema: EventIdSchema },
  { swiftName: "CalendarId", schema: CalendarIdSchema },
  { swiftName: "DateTime", schema: DateTimeSchema },
  { swiftName: "DateOnly", schema: DateOnlySchema },
  { swiftName: "IANATimeZone", schema: TimeZoneSchema },
  { swiftName: "ConnectionId", schema: ConnectionIdSchema },
];

/** Top-level Codable contracts for the native macOS client. */
export const SWIFT_CONTRACT_MANIFEST: SwiftContractManifestEntry[] = [
  { swiftName: "Event", schema: EventSchema },
  { swiftName: "EventResponse", schema: EventResponseSchema },
  { swiftName: "EventListResponse", schema: EventListResponseSchema },
  { swiftName: "BusyPeriod", schema: BusyPeriodSchema },
  { swiftName: "AvailabilityResponse", schema: AvailabilityResponseSchema },
  { swiftName: "CreateEventInput", schema: CreateEventInputSchema },
  { swiftName: "ReplaceEventInput", schema: ReplaceEventInputSchema },
  { swiftName: "DeleteEventInput", schema: DeleteEventInputSchema },
  { swiftName: "RsvpEventInput", schema: RsvpEventInputSchema },
  { swiftName: "EventMutationError", schema: EventMutationErrorSchema },
  { swiftName: "CompassEvent", schema: CompassEventSchema },
  { swiftName: "CompassCalendar", schema: CalendarSchema },
  { swiftName: "CalendarListResponse", schema: CalendarListResponseSchema },
  { swiftName: "ServerMessage", schema: ServerMessageSchema },
  { swiftName: "ContactSuggestion", schema: ContactSuggestionSchema },
  {
    swiftName: "ContactSuggestionsResponse",
    schema: ContactSuggestionsResponseSchema,
  },
  { swiftName: "EventColorSlot", schema: EventColorSlotSchema },
  { swiftName: "Organizer", schema: OrganizerSchema },
  { swiftName: "Attendee", schema: AttendeeSchema },
  { swiftName: "Conference", schema: ConferenceSchema },
  {
    swiftName: "HiddenEventIdsResponse",
    schema: HiddenEventIdsResponseSchema,
  },
  { swiftName: "SetEventHiddenInput", schema: SetEventHiddenInputSchema },
  { swiftName: "BookingPage", schema: BookingPageSchema },
  {
    swiftName: "AdminPutBookingPageInput",
    schema: AdminPutBookingPageInputSchema,
  },
  {
    swiftName: "AdminGetBookingPageResponse",
    schema: AdminGetBookingPageResponseSchema,
  },
  {
    swiftName: "AdminGetBookingPageSetupResponse",
    schema: AdminGetBookingPageSetupResponseSchema,
  },
  {
    swiftName: "BookingPageStatusResponse",
    schema: BookingPageStatusResponseSchema,
  },
  {
    swiftName: "PublicGetBookingPageResponse",
    schema: PublicGetBookingPageResponseSchema,
  },
  { swiftName: "BookingSlotsResponse", schema: BookingSlotsResponseSchema },
  {
    swiftName: "BookingOperationEvent",
    schema: BookingOperationEventSchema,
  },
  {
    swiftName: "BookingOperationHeartbeat",
    schema: BookingOperationHeartbeatSchema,
  },
  { swiftName: "BillingStatusResponse", schema: BillingStatusResponseSchema },
  {
    swiftName: "BillingSubscriptionResponse",
    schema: BillingSubscriptionResponseSchema,
  },
  {
    swiftName: "BillingCheckoutResponse",
    schema: BillingCheckoutResponseSchema,
  },
  { swiftName: "AppConfig", schema: AppConfigSchema },
  { swiftName: "ConnectionBeginRequest", schema: ConnectionBeginRequestSchema },
  {
    swiftName: "ConnectionBeginRedirectResponse",
    schema: ConnectionBeginRedirectResponseSchema,
  },
  {
    swiftName: "ConnectionBeginConnectedResponse",
    schema: ConnectionBeginConnectedResponseSchema,
  },
  {
    swiftName: "ConnectionCredentialBrowserRequest",
    schema: ConnectionCredentialBrowserRequestSchema,
  },
  {
    swiftName: "ConnectionCredentialResponse",
    schema: ConnectionCredentialResponseSchema,
  },
  {
    swiftName: "ConnectionRefreshResponse",
    schema: ConnectionRefreshResponseSchema,
  },
  { swiftName: "UserProfile", schema: UserProfileSchema },
  { swiftName: "UserMetadata", schema: UserMetadataSchema },
];
