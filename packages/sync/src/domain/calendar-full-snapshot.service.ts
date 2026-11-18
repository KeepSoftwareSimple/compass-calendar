import { toColorLabelMap } from "@sync/domain/color-label-map";
import { listEventPageWithAuthRetry } from "@sync/domain/list-event-page-with-auth-retry";
import { providerEventFingerprint } from "@sync/domain/provider-page-applier";
import { type AccessTokenSource } from "@sync/domain/provider-write-ladder";
import { type ProviderEventReader } from "@sync/providers/provider-event-reader.port";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import { type SyncResourceRecord } from "@sync/storage/contracts/sync-resource.contracts";
import { type CommandRepository } from "@sync/storage/repositories/command.repository";
import { type EventRepository } from "@sync/storage/repositories/event.repository";
import { type SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

export interface FullSnapshotUnchangedDeps {
  events: EventRepository;
  resources: SyncResourceRepository;
  commands?: Pick<CommandRepository, "nonterminalEventIds">;
  reader: ProviderEventReader;
  custody: AccessTokenSource;
}

export type FullSnapshotUnchangedProbe =
  | { unchanged: true; syncCursor: string }
  | { unchanged: false };

/** Read every provider page and check whether etags match the active generation. */
export async function probeFullSnapshotUnchanged(
  deps: FullSnapshotUnchangedDeps,
  calendar: ProviderCalendarRecord,
  resource: SyncResourceRecord,
): Promise<FullSnapshotUnchangedProbe> {
  if (deps.commands) {
    const pending = await deps.commands.nonterminalEventIds(
      calendar.tenantId,
      calendar.principalId,
    );
    if (pending.length > 0) return { unchanged: false };
  }

  const local = await deps.events.listProviderFingerprintsAtGeneration(
    calendar.tenantId,
    calendar.principalId,
    calendar._id,
    resource.activeGeneration,
  );

  let accessToken = await deps.custody.getValidAccessToken(
    calendar.connectionId,
  );
  const colorLabels = toColorLabelMap(calendar.eventLabels);
  const calendarDefaultPopupReminderMinutes =
    calendar.defaultPopupReminderMinutes ?? [];
  let pageToken: string | null = null;
  let syncCursor: string | null = null;
  const provider = new Map<string, string>();

  do {
    const read = await listEventPageWithAuthRetry(deps, calendar.connectionId, {
      accessToken,
      calendarId: calendar.providerCalendarId,
      pageToken,
      colorLabels,
      calendarDefaultPopupReminderMinutes,
    });
    accessToken = read.accessToken;
    const page = read.page;
    for (const eventRead of page.events) {
      provider.set(
        eventRead.providerEventId,
        providerEventFingerprint(eventRead),
      );
    }
    pageToken = page.nextPageToken;
    syncCursor = page.nextSyncToken ?? syncCursor;
  } while (pageToken);

  if (!syncCursor) return { unchanged: false };
  if (provider.size !== local.size) return { unchanged: false };
  for (const [id, fingerprint] of provider) {
    if (local.get(id) !== fingerprint) return { unchanged: false };
  }
  for (const id of local.keys()) {
    if (!provider.has(id)) return { unchanged: false };
  }
  return { unchanged: true, syncCursor };
}
