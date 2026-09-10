import {
  type Calendar,
  conferenceForProvider,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { type GoogleSyncConnectionSummary } from "@core/types/user.types";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";

/**
 * A full, contract-valid Calendar with sane defaults. One shared builder so a
 * Calendar contract change (like accountEmail, added for multi-account) is
 * threaded through one file instead of a per-test-file copy each.
 */
export function createMockCalendar(
  overrides: Partial<Calendar> = {},
): Calendar {
  const calendar: Calendar = {
    id: CalendarIdSchema.parse(createObjectIdString()),
    name: "Work",
    description: "",
    timeZone: null,
    foregroundColor: "#000000",
    backgroundColor: "#3b82f6",
    provider: "google",
    access: "owner",
    capabilities: getCalendarCapabilities("owner"),
    isPrimary: false,
    isVisible: true,
    isActive: true,
    createsGoogleMeet: true,
    conference: "meet",
    ...overrides,
  };
  if (overrides.conference === undefined) {
    calendar.conference = conferenceForProvider(
      calendar.provider,
      calendar.createsGoogleMeet !== false,
    );
  }
  if (overrides.createsGoogleMeet === undefined) {
    calendar.createsGoogleMeet = calendar.conference === "meet";
  }
  return calendar;
}

/** A healthy connected-account summary; override state fields to break it. */
export function createMockConnection(
  accountEmail: string,
  overrides: Partial<GoogleSyncConnectionSummary> = {},
): GoogleSyncConnectionSummary {
  return {
    id: createObjectIdString(),
    state: "healthy",
    stateReason: null,
    lastSyncedAt: null,
    lastHealthyAt: null,
    accountEmail,
    connectionState: "HEALTHY",
    canSuggestContacts: false,
    provider: "google",
    ...overrides,
  };
}
