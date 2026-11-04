import {
  type BookingMeetingType,
  type BookingMeetingTypes,
  type PublicBookingPage,
  resolveBookingMeetingType,
  resolveBookingMeetingTypes,
} from "@core/types/booking.contracts";

export interface PublicMeetingTypeSelection {
  types: BookingMeetingTypes;
  selected: BookingMeetingType;
  /**
   * The id to send to the server, or undefined for type #1. Type #1 is what
   * the server picks without an id, so a one-type page sends what it always
   * sent.
   */
  requestTypeId: string | undefined;
}

/**
 * Omit type #1 from query and slot-request ids. The server already picks the
 * first type when the id is missing, so one-type pages and default picks keep
 * the short URL they always used.
 */
export function optionalMeetingTypeId(
  types: BookingMeetingTypes,
  id: string,
): string | undefined {
  return id === types[0]?.id ? undefined : id;
}

/** `?type=` picks a meeting type; a missing or unknown id means type #1. */
export function selectPublicMeetingType(
  page: Pick<PublicBookingPage, "durationMinutes" | "meetingTypes">,
  typeParam: string | undefined,
): PublicMeetingTypeSelection {
  const types = resolveBookingMeetingTypes(page);
  const selected = resolveBookingMeetingType(types, typeParam);
  return {
    types,
    selected,
    requestTypeId: optionalMeetingTypeId(types, selected.id),
  };
}
