import { type Calendar } from "@core/types/calendar.contracts";
import {
  type CalendarId,
  CalendarIdSchema,
} from "@core/types/domain-primitives";
import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";

const STORAGE_KEY = "compass.localCalendarId";

// A client-generated id for the browser's local (offline/anonymous) calendar,
// persisted so IndexedDB rows and the synthesized Calendar object agree on the
// same id across reloads. The server's own local calendar (used once
// signed in) has a different, server-assigned id; syncLocalEventsToCloud maps
// this sentinel onto it before pushing.
export function getLocalCalendarSentinelId(): CalendarId {
  const existing = persistentBrowserStore.get(STORAGE_KEY);
  if (existing) {
    const parsed = CalendarIdSchema.safeParse(existing);
    if (parsed.success) return parsed.data;
  }

  const generated = CalendarIdSchema.parse(createObjectIdString());
  persistentBrowserStore.set(STORAGE_KEY, generated);
  return generated;
}

// Synthesizes a local Calendar so anonymous/offline mode never branches on
// "no calendars yet" - downstream code always has at least one calendar to
// target.
/** True when the cache still holds only the anonymous local calendar. */
export function isSentinelCalendarList(
  calendars: Calendar[] | null | undefined,
): boolean {
  return (
    calendars?.length === 1 && calendars[0]?.id === getLocalCalendarSentinelId()
  );
}

export function synthesizeLocalCalendar(id: CalendarId): Calendar {
  return {
    id,
    // Matches the server's ensureLocalCalendar name so the sidebar row doesn't
    // rename itself from "Local" to "Compass" when an anonymous user signs up.
    name: "Compass",
    description: "",
    timeZone: null,
    foregroundColor: "#000000",
    backgroundColor: "#ffffff",
    provider: "local",
    access: "owner",
    capabilities: {
      canReadAvailability: true,
      canReadDetails: true,
      canWrite: true,
      canManage: false,
      canWatchEvents: false,
      canInviteAttendees: false,
      conferenceKinds: [],
    },
    isPrimary: true,
    isVisible: true,
    isActive: true,
  };
}
