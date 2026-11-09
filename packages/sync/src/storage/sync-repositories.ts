import { CommandRepository } from "@sync/storage/repositories/command.repository";
import { CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { DeletionMarkerRepository } from "@sync/storage/repositories/deletion-marker.repository";
import { EventRepository } from "@sync/storage/repositories/event.repository";
import { EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { HostGuestRsvpObservationRepository } from "@sync/storage/repositories/host-guest-rsvp-observation.repository";
import { InvalidationRepository } from "@sync/storage/repositories/invalidation.repository";
import { JobRepository } from "@sync/storage/repositories/job.repository";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";
import { type SyncMongoService } from "@sync/storage/sync-mongo.service";

export interface SyncRepositories {
  connections: ProviderConnectionRepository;
  credentials: CredentialRepository;
  calendars: ProviderCalendarRepository;
  events: EventRepository;
  eventOccurrences: EventOccurrenceRepository;
  syncResources: SyncResourceRepository;
  jobs: JobRepository;
  deletionMarkers: DeletionMarkerRepository;
  invalidations: InvalidationRepository;
  commands: CommandRepository;
  hostGuestRsvpObservations: HostGuestRsvpObservationRepository;
}

// Every repository, bound to the connected db. They are cheap, stateless
// collection handles, so building the full bag even when a caller only needs
// most of it costs nothing — this replaces the repeated `new XRepository(db)`
// construction scattered across route handlers and app.ts's scheduler
// builders. A caller needing only one or two repositories can still construct
// them directly; reach for this once a call site wants three or more.
export function syncRepositories(mongo: SyncMongoService): SyncRepositories {
  const db = mongo.db;
  return {
    connections: new ProviderConnectionRepository(db),
    credentials: new CredentialRepository(db),
    calendars: new ProviderCalendarRepository(db),
    events: new EventRepository(db),
    eventOccurrences: new EventOccurrenceRepository(db, mongo.client),
    syncResources: new SyncResourceRepository(db),
    jobs: new JobRepository(db),
    deletionMarkers: new DeletionMarkerRepository(db),
    invalidations: new InvalidationRepository(db),
    commands: new CommandRepository(db),
    hostGuestRsvpObservations: new HostGuestRsvpObservationRepository(db),
  };
}
