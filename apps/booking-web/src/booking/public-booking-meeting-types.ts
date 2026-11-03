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
    requestTypeId: selected.id === types[0]?.id ? undefined : selected.id,
  };
}

/** The `?type=` value for a pick: type #1 clears it so links stay short. */
export function meetingTypeSearchValue(
  types: BookingMeetingTypes,
  id: string,
): string | undefined {
  return id === types[0]?.id ? undefined : id;
}
