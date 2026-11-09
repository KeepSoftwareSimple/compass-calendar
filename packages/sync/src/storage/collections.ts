// Collection names for the isolated `compass_sync` database.
// One document per connection, calendar, event, occurrence, resource, command,
// job, and deletion marker — never growing per-user arrays. Repositories for
// these land in later commits; the bootstrap here creates them with their
// indexes.
export const SYNC_COLLECTIONS = {
  providerConnections: "provider_connections",
  credentials: "credentials",
  providerCalendars: "provider_calendars",
  events: "events",
  eventOccurrences: "event_occurrences",
  syncResources: "sync_resources",
  commands: "commands",
  jobs: "jobs",
  deletionMarkers: "deletion_markers",
  // Append-only, content-free invalidation outbox for GET /internal/changes.
  invalidations: "invalidations",
  hostGuestRsvpObservations: "host_guest_rsvp_observations",
} as const;

export type SyncCollectionName =
  (typeof SYNC_COLLECTIONS)[keyof typeof SYNC_COLLECTIONS];
