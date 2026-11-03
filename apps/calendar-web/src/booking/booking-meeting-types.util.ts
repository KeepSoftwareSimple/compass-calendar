import {
  type AdminPutBookingPageInput,
  BOOKING_MAX_MEETING_TYPES,
  type BookingDurationMinutes,
  type BookingMeetingTypes,
  defaultMeetingTypeLabel,
  meetingTypeWithDuration,
  resolveBookingMeetingTypes,
} from "@core/types/booking.contracts";
import { BOOKING_DURATION_OPTIONS } from "@web/booking/booking.util";

type MeetingTypesForm = Pick<
  AdminPutBookingPageInput,
  "durationMinutes" | "meetingTypes"
>;

/** What the editor shows: stored types, or type #1 derived from the duration. */
export const formMeetingTypes = (form: MeetingTypesForm): BookingMeetingTypes =>
  resolveBookingMeetingTypes(form);

/** The form patch for a new list. `durationMinutes` always mirrors type #1. */
export const meetingTypesPatch = (
  types: BookingMeetingTypes,
): Pick<AdminPutBookingPageInput, "durationMinutes" | "meetingTypes"> => {
  const first = types[0];
  if (!first) {
    throw new Error("A meeting page needs at least one meeting type");
  }
  return { durationMinutes: first.durationMinutes, meetingTypes: types };
};

/**
 * Change one type's duration. A form that never held `meetingTypes` (a page
 * from before meeting types, or the setup wizard) keeps sending only
 * `durationMinutes`, so the PUT stays what older pages already send.
 */
export const setMeetingTypeDuration = (
  form: MeetingTypesForm,
  index: number,
  durationMinutes: BookingDurationMinutes,
): Partial<AdminPutBookingPageInput> => {
  if (form.meetingTypes === undefined && index === 0) {
    return { durationMinutes };
  }
  return meetingTypesPatch(
    formMeetingTypes(form).map((type, i) =>
      i === index ? meetingTypeWithDuration(type, durationMinutes) : type,
    ),
  );
};

/** Labels are trimmed only by the contract on save, so typing a space works. */
export const setMeetingTypeLabel = (
  form: MeetingTypesForm,
  index: number,
  label: string,
): Partial<AdminPutBookingPageInput> =>
  meetingTypesPatch(
    formMeetingTypes(form).map((type, i) =>
      i === index ? { ...type, label } : type,
    ),
  );

export const canAddMeetingType = (form: MeetingTypesForm): boolean =>
  formMeetingTypes(form).length < BOOKING_MAX_MEETING_TYPES;

export const canRemoveMeetingType = (form: MeetingTypesForm): boolean =>
  formMeetingTypes(form).length > 1;

const randomIdSuffix = (): string =>
  Math.random().toString(36).slice(2, 8).padEnd(6, "0");

/** Ids are made here, once, and never change, so `?type=` links stay valid. */
export const newMeetingTypeId = (
  taken: readonly string[],
  suffix: () => string = randomIdSuffix,
): string => {
  for (;;) {
    const id = `type-${suffix()}`;
    if (!taken.includes(id)) return id;
  }
};

/** The next row: the first duration not offered yet, with its default label. */
export const addMeetingType = (
  form: MeetingTypesForm,
  makeId: (taken: readonly string[]) => string = newMeetingTypeId,
): { patch: Partial<AdminPutBookingPageInput>; id: string } | null => {
  const types = formMeetingTypes(form);
  if (types.length >= BOOKING_MAX_MEETING_TYPES) return null;
  const used = new Set(types.map((type) => type.durationMinutes));
  const durationMinutes =
    BOOKING_DURATION_OPTIONS.find((minutes) => !used.has(minutes)) ??
    types[types.length - 1]?.durationMinutes ??
    30;
  const id = makeId(types.map((type) => type.id));
  return {
    id,
    patch: meetingTypesPatch([
      ...types,
      { id, label: defaultMeetingTypeLabel(durationMinutes), durationMinutes },
    ]),
  };
};

export const removeMeetingType = (
  form: MeetingTypesForm,
  index: number,
): Partial<AdminPutBookingPageInput> | null => {
  const types = formMeetingTypes(form);
  if (types.length <= 1 || index < 0 || index >= types.length) return null;
  return meetingTypesPatch(types.filter((_, i) => i !== index));
};
