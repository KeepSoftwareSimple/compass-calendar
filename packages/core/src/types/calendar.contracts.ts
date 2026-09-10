import { z } from "zod/v4";
import {
  CalendarIdSchema,
  HexColorSchema,
  TimeZoneSchema,
} from "@core/types/domain-primitives";
import {
  type ProviderCapability,
  ProviderKindSchema,
} from "@core/types/sync/identity.contracts";

// "local" is the browser-only calendar; everything else is a connected
// provider account, so the type is `"local" | ProviderKind` by construction.
export const CalendarProviderSchema = z.union([
  z.literal("local"),
  ProviderKindSchema,
]);
export type CalendarProvider = z.infer<typeof CalendarProviderSchema>;

export const CalendarConferenceSchema = z.enum(["meet", "teams", "none"]);
export type CalendarConference = z.infer<typeof CalendarConferenceSchema>;

export const CONFERENCE_BY_PROVIDER = {
  local: "none",
  google: "meet",
  microsoft: "teams",
  apple: "none",
} as const satisfies Record<CalendarProvider, CalendarConference>;

export function conferenceForProvider(
  provider: CalendarProvider,
  canCreateConference = true,
): CalendarConference {
  if (!canCreateConference) {
    return "none";
  }
  return CONFERENCE_BY_PROVIDER[provider];
}

export const CalendarConferenceKindSchema = z.enum(["meet", "teams"]);
export type CalendarConferenceKind = z.infer<
  typeof CalendarConferenceKindSchema
>;

export function conferenceKindsForConference(
  conference: CalendarConference,
): readonly CalendarConferenceKind[] {
  return conference === "none" ? [] : [conference];
}

export function canCreateConferenceForDestination(
  provider: CalendarProvider,
  calendarCreatesConference: boolean,
  connectionCapabilities?: readonly ProviderCapability[],
): boolean {
  if (!calendarCreatesConference) {
    return false;
  }
  if (provider === "microsoft") {
    return connectionCapabilities?.includes("createTeamsMeeting") ?? false;
  }
  return true;
}

export function conferenceForDestination(
  provider: CalendarProvider,
  calendarCreatesConference: boolean,
  connectionCapabilities?: readonly ProviderCapability[],
): CalendarConference {
  return conferenceForProvider(
    provider,
    canCreateConferenceForDestination(
      provider,
      calendarCreatesConference,
      connectionCapabilities,
    ),
  );
}

export function createsGoogleMeetFromConference(
  conference: CalendarConference,
): boolean {
  return conference === "meet";
}

export const CalendarAccessSchema = z.enum([
  "owner",
  "writer",
  "reader",
  "freeBusyReader",
]);
export type CalendarAccess = z.infer<typeof CalendarAccessSchema>;

export const CalendarCapabilitiesSchema = z.strictObject({
  canReadAvailability: z.boolean(),
  canReadDetails: z.boolean(),
  canWrite: z.boolean(),
  canManage: z.boolean(),
  canWatchEvents: z.boolean(),
  canInviteAttendees: z.boolean(),
  // Conference kinds this calendar can mint on create. Empty when none.
  conferenceKinds: z.array(CalendarConferenceKindSchema).readonly(),
});
export type CalendarCapabilities = z.infer<typeof CalendarCapabilitiesSchema>;

export const CalendarSchema = z.strictObject({
  id: CalendarIdSchema,
  name: z.string(),
  description: z.string(),
  timeZone: TimeZoneSchema.nullable(),
  foregroundColor: HexColorSchema,
  backgroundColor: HexColorSchema,
  provider: CalendarProviderSchema,
  access: CalendarAccessSchema,
  capabilities: CalendarCapabilitiesSchema,
  isPrimary: z.boolean(),
  isVisible: z.boolean(),
  isActive: z.boolean(),
  // Whether this calendar can mint a Google Meet URL. Local calendars are
  // false. Omitted or true keeps the current Meet promise. Prefer `conference`.
  createsGoogleMeet: z.boolean().optional(),
  // Conference kind the destination can mint on create. Derived from the
  // calendar's provider (`CONFERENCE_BY_PROVIDER`) and whether that calendar
  // can actually create a conference link.
  conference: CalendarConferenceSchema.optional(),
  // Email of the connected provider account this calendar belongs to. With
  // `provider` it forms the calendar's account identity on the wire: one
  // email backs at most one account per provider, but the same address can
  // be a Google account and a Microsoft account, so grouping and labelling
  // key off (provider, accountEmail), never the email alone. Absent for the
  // local calendar, and for provider accounts that reported no email.
  accountEmail: z.string().optional(),
});
export type Calendar = z.infer<typeof CalendarSchema>;

export const CalendarListResponseSchema = z.strictObject({
  calendars: z.array(CalendarSchema),
});
export type CalendarListResponse = z.infer<typeof CalendarListResponseSchema>;

export const CAPABILITIES_BY_ACCESS = {
  owner: {
    canReadAvailability: true,
    canReadDetails: true,
    canWrite: true,
    canManage: true,
    canWatchEvents: true,
    canInviteAttendees: true,
  },
  writer: {
    canReadAvailability: true,
    canReadDetails: true,
    canWrite: true,
    canManage: false,
    canWatchEvents: true,
    canInviteAttendees: true,
  },
  reader: {
    canReadAvailability: true,
    canReadDetails: true,
    canWrite: false,
    canManage: false,
    canWatchEvents: true,
    canInviteAttendees: false,
  },
  freeBusyReader: {
    canReadAvailability: true,
    canReadDetails: false,
    canWrite: false,
    canManage: false,
    canWatchEvents: false,
    canInviteAttendees: false,
  },
} as const satisfies Record<
  CalendarAccess,
  Omit<CalendarCapabilities, "conferenceKinds">
>;

export const getCalendarCapabilities = (
  access: CalendarAccess,
): CalendarCapabilities => ({
  ...CAPABILITIES_BY_ACCESS[access],
  conferenceKinds: [],
});
