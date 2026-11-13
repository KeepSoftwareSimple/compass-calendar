import {
  type Calendar,
  type CalendarAccess,
  CalendarSchema,
  conferenceForDestination,
  conferenceKindsForConference,
  createsGoogleMeetFromConference,
  getCalendarCapabilities,
} from "@core/types/calendar.contracts";
import { HexColorSchema } from "@core/types/domain-primitives";
import {
  type ProviderCalendar,
  type ProviderConnection,
} from "@core/types/sync/connection.contracts";
import { type ProviderKind } from "@core/types/sync/identity.contracts";

// Legacy's default calendar colours (map.calendar.ts), reused so a sync-served
// calendar looks identical to a legacy one when the provider omits a colour.
const DEFAULT_BACKGROUND = "#9e9e9e";
const DEFAULT_FOREGROUND = "#000000";

// Sync reports the provider's access role in its own vocabulary; the browser
// Calendar uses the legacy Google-derived enum. Exhaustive, no default, so a new
// role fails the build rather than silently mapping to something permissive.
const mapCalendarAccessRole = (
  role: ProviderCalendar["accessRole"],
): CalendarAccess => {
  switch (role) {
    case "owner":
      return "owner";
    case "editor":
      return "writer";
    case "viewer":
      return "reader";
    case "busyOnly":
      return "freeBusyReader";
  }
};

// Translate one sync ProviderCalendar into the browser Calendar contract. Under
// sync-owned calendars (S39 option 2), the browser uses sync's calendar id
// directly, so no id bridge is needed. Capabilities are DERIVED from the access
// role via the same helper the legacy mapper uses, sidestepping the difference
// between sync's and the browser's capability shapes.
//
// Deliberate v1 gaps, all contract-valid: description is empty and timeZone is
// null (sync's provider_calendars stores neither), the single provider colour
// becomes the background (foreground defaults), and isVisible is always true —
// visibility is owned client-side now, so the server reports every calendar
// visible and the web applies its own hidden set.
//
// `accountEmail` is the owning connection's account email, joined from the
// principal's connection list by syncCalendarsToBrowser below (sync's
// ProviderCalendar only carries connectionId). Omitted when the connection
// reported no email.
const syncCalendarToBrowser = (
  calendar: ProviderCalendar,
  provider: ProviderKind,
  accountEmail?: string,
  connectionCapabilities?: ProviderConnection["capabilities"],
): Calendar => {
  const access = mapCalendarAccessRole(calendar.accessRole);
  const conference = conferenceForDestination(
    provider,
    calendar.createsGoogleMeet !== false,
    connectionCapabilities,
  );
  // Sync stores the provider colour as a loose string; the browser Calendar
  // requires a hex colour. Fall back to the default rather than 500 the whole
  // list if a provider ever hands back a non-hex value.
  const backgroundColor =
    calendar.color && HexColorSchema.safeParse(calendar.color).success
      ? calendar.color
      : DEFAULT_BACKGROUND;
  return CalendarSchema.parse({
    id: calendar.id,
    name: calendar.displayName,
    description: "",
    timeZone: null,
    foregroundColor: DEFAULT_FOREGROUND,
    backgroundColor,
    provider,
    access,
    capabilities: {
      ...getCalendarCapabilities(access),
      canInviteAttendees: calendar.capabilities.canWriteEvents,
      conferenceKinds: conferenceKindsForConference(conference),
    },
    isPrimary: calendar.primary,
    isVisible: true,
    isActive: calendar.active,
    createsGoogleMeet: createsGoogleMeetFromConference(conference),
    conference,
    ...(accountEmail ? { accountEmail } : {}),
  });
};

// Translate a principal's sync calendars to the browser contract, joining each
// calendar to its owning connection's provider and account email by connectionId.
export const syncCalendarsToBrowser = (
  calendars: readonly ProviderCalendar[],
  connections: readonly ProviderConnection[],
): Calendar[] => {
  const connectionById = new Map(
    connections.map((connection) => [connection.id, connection]),
  );
  return calendars.flatMap((calendar) => {
    const connection = connectionById.get(calendar.connectionId);
    // Sync retains disconnected accounts' calendars until retention cleanup.
    // Sending them to the browser recreates the removed account's sidebar
    // section on the first refetch after disconnecting.
    if (connection?.state === "disconnected") return [];
    return [
      syncCalendarToBrowser(
        calendar,
        connection?.provider ?? "google",
        connection?.account.email ?? undefined,
        connection?.capabilities,
      ),
    ];
  });
};
