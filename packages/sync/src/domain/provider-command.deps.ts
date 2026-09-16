import {
  type ConnectionId,
  type PrincipalId,
  type ProviderKind,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { type AccessTokenSource } from "@sync/domain/provider-write-ladder";
import { type ProviderEventWriter } from "@sync/providers/provider-event-writer.port";
import { type CommandRepository } from "@sync/storage/repositories/command.repository";
import { type DeletionMarkerRepository } from "@sync/storage/repositories/deletion-marker.repository";
import { type EventRepository } from "@sync/storage/repositories/event.repository";
import { type EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { type SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

// The single connection fact the attendee organizer guard needs, narrowed
// from ProviderConnectionRepository so tests can fake it without a database.
export interface ProviderConnectionLookup {
  findById(
    tenantId: TenantId,
    principalId: PrincipalId,
    id: ConnectionId,
  ): Promise<{
    readonly account: { readonly email: string | null };
    readonly provider: ProviderKind;
  } | null>;
}

export interface ProviderMutationDeps {
  commands: CommandRepository;
  events: EventRepository;
  // The derived occurrence projection, rebuilt (or cleared, on delete) so a
  // provider-linked event appears in range queries.
  occurrences: EventOccurrenceRepository;
  // Reads serve a calendar's active generation, so a create has to ask which
  // generation that is rather than assume the calendar has never been repaired.
  resources: SyncResourceRepository;
  // Which account the write acts as — a guest-list replace is only valid on
  // an event that account organizes (see organizerGuardFailure).
  connections: ProviderConnectionLookup;
  writer: ProviderEventWriter;
  custody: AccessTokenSource;
}

// Delete also needs the deletion-marker store for the tombstone.
export interface ProviderDeleteDeps extends ProviderMutationDeps {
  markers: DeletionMarkerRepository;
}
