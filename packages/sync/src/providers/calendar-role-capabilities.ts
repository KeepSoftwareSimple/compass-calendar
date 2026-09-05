import {
  type CalendarAccessRole,
  type SyncCalendarCapabilities,
} from "@core/types/sync/connection.contracts";

// Operational capabilities implied by each access role. Invite ability follows
// write access — providers expose no separate per-calendar attendee-invite flag.

const CAPABILITIES_BY_ROLE: Record<
  CalendarAccessRole,
  SyncCalendarCapabilities
> = {
  owner: {
    canReadEvents: true,
    canWriteEvents: true,
    canReadBusy: true,
    canInviteAttendees: true,
  },
  editor: {
    canReadEvents: true,
    canWriteEvents: true,
    canReadBusy: true,
    canInviteAttendees: true,
  },
  viewer: {
    canReadEvents: true,
    canWriteEvents: false,
    canReadBusy: true,
    canInviteAttendees: false,
  },
  busyOnly: {
    canReadEvents: false,
    canWriteEvents: false,
    canReadBusy: true,
    canInviteAttendees: false,
  },
};

export function capabilitiesForAccessRole(
  role: CalendarAccessRole,
): SyncCalendarCapabilities {
  return CAPABILITIES_BY_ROLE[role];
}
