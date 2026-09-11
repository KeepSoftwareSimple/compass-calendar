import { faker } from "@faker-js/faker";
import { type EventId } from "@core/types/domain-primitives";
import {
  type ConnectionId,
  type IdempotencyKey,
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import {
  seedOauthCredential,
  TEST_CREDENTIAL_ENCRYPTION_KEY,
} from "@sync/__tests__/helpers/credential-encryption";
import { seedProviderCalendar } from "@sync/__tests__/helpers/fixtures";
import { type SyncExecutionMode } from "@sync/config/sync.config";
import { type CredentialCustody } from "@sync/credentials/credential-custody.service";
import { type CloudCommandDeps } from "@sync/domain/cloud-command.service";
import { type ProviderConnectionLookup } from "@sync/domain/provider-command.service";
import { type AccessTokenSource } from "@sync/domain/provider-write-ladder";
import {
  type ProviderAuthAdapter,
  type RefreshedCredential,
} from "@sync/providers/provider-auth.port";
import { type ProviderEvent } from "@sync/providers/provider-event.port";
import {
  type ProviderCreateInput,
  type ProviderDeleteInput,
  type ProviderEventWriter,
  type ProviderFetchInput,
  type ProviderInstanceFetchInput,
  type ProviderPatchInput,
  type ProviderWriteResult,
} from "@sync/providers/provider-event-writer.port";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import { CommandRepository } from "@sync/storage/repositories/command.repository";
import { CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { DeletionMarkerRepository } from "@sync/storage/repositories/deletion-marker.repository";
import { EventRepository } from "@sync/storage/repositories/event.repository";
import { EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";
import { type SyncMongoService } from "@sync/storage/sync-mongo.service";
import { beforeEach } from "bun:test";

const objectId = () => faker.database.mongodbObjectId();

export const COMMAND_NOW = (): Date => new Date("2026-07-10T00:00:00.000Z");

export type CommandIds = {
  tenantId: TenantId;
  principalId: PrincipalId;
  connectionId: ConnectionId;
  eventId: EventId;
  idempotencyKey: IdempotencyKey;
};

export type CommandRepos = {
  mongo: SyncMongoService;
  commands: CommandRepository;
  events: EventRepository;
  occurrences: EventOccurrenceRepository;
  resources: SyncResourceRepository;
  calendars: ProviderCalendarRepository;
  markers: DeletionMarkerRepository;
  credentials: CredentialRepository;
};

export function newCommandIds(): CommandIds {
  return {
    tenantId: objectId() as TenantId,
    principalId: objectId() as PrincipalId,
    connectionId: objectId() as ConnectionId,
    eventId: objectId() as EventId,
    idempotencyKey: `idem-${objectId()}` as IdempotencyKey,
  };
}

function openCommandRepos(mongo: SyncMongoService): CommandRepos {
  return {
    mongo,
    commands: new CommandRepository(mongo.db),
    events: new EventRepository(mongo.db),
    occurrences: new EventOccurrenceRepository(mongo.db, mongo.client),
    resources: new SyncResourceRepository(mongo.db),
    calendars: new ProviderCalendarRepository(mongo.db),
    markers: new DeletionMarkerRepository(mongo.db),
    credentials: new CredentialRepository(mongo.db),
  };
}

// One file-level repo bag for command DB tests. beforeEach reopens against
// the wiped database; callers read properties (do not destructure at load).
export function bindCommandRepos(storage: {
  mongo: () => SyncMongoService;
}): CommandRepos {
  const repos = {} as CommandRepos;
  beforeEach(() => {
    Object.assign(repos, openCommandRepos(storage.mongo()));
  });
  return repos;
}

export function seedCommandCalendar(
  calendars: ProviderCalendarRepository,
  ids: Pick<CommandIds, "tenantId" | "principalId" | "connectionId">,
  overrides: Parameters<typeof seedProviderCalendar>[1] = {},
): Promise<ProviderCalendarRecord> {
  return seedProviderCalendar(calendars, {
    tenantId: ids.tenantId,
    principalId: ids.principalId,
    connectionId: ids.connectionId,
    ...overrides,
  });
}

export async function seedLinkedEvent(
  events: EventRepository,
  input: {
    ids: Pick<CommandIds, "tenantId" | "principalId" | "connectionId">;
    calendarId: EventRecord["calendarId"];
    content: EventRecord["content"];
    schedule: EventRecord["schedule"];
    recurrence: EventRecord["recurrence"];
    now: Date;
    eventId?: EventId;
    providerEventId?: string;
    providerVersion?: string;
  },
): Promise<EventRecord> {
  const eventId = input.eventId ?? (objectId() as EventId);
  await events.put({
    _id: eventId,
    tenantId: input.ids.tenantId,
    principalId: input.ids.principalId,
    origin: "compass",
    calendarId: input.calendarId,
    clientEventId: null,
    connectionId: input.ids.connectionId,
    providerEventId: (input.providerEventId ?? "g-evt-1") as never,
    providerVersion: (input.providerVersion ?? "etag-1") as never,
    providerUpdatedAt: null,
    deliveryState: "confirmed",
    providerMetadata: null,
    content: input.content,
    schedule: input.schedule,
    recurrence: input.recurrence,
    lifecycleState: "active",
    generation: 0,
    createdAt: input.now,
    updatedAt: input.now,
    confirmedAt: input.now,
  } as never);
  const event = await events.findById(
    input.ids.tenantId,
    input.ids.principalId,
    eventId,
  );
  if (!event) throw new Error("seed failed to read back the event");
  return event;
}

export const stubConnectionLookup = (
  email = "user@example.com",
): ProviderConnectionLookup => ({
  findById: async () => ({
    account: { email },
    provider: "google",
  }),
});

export const fakeCredentialCustody = (): CredentialCustody =>
  ({
    getValidAccessToken: async () => "access-token",
    discardRevoked: async () => {},
    invalidateAccessToken: async () => {},
  }) as unknown as CredentialCustody;

export const cloudCommandDeps = (
  repoSlice: Pick<
    CommandRepos,
    | "commands"
    | "events"
    | "calendars"
    | "occurrences"
    | "resources"
    | "markers"
  >,
  options: {
    execution?: SyncExecutionMode;
    connections?: ProviderConnectionLookup;
    provider?: CloudCommandDeps["provider"];
  } = {},
): CloudCommandDeps => ({
  ...repoSlice,
  connections: options.connections ?? stubConnectionLookup(),
  execution: options.execution ?? "active",
  provider: options.provider,
});

export const tokenSource = (token = "access-token"): AccessTokenSource => ({
  getValidAccessToken: async () => token,
  discardRevoked: async () => {},
  invalidateAccessToken: async () => {},
});

export type ProviderCommandRepos = Pick<
  CommandRepos,
  "commands" | "events" | "occurrences" | "resources" | "markers"
>;

export const providerMutationDeps = (
  repoSlice: Pick<
    CommandRepos,
    "commands" | "events" | "occurrences" | "resources"
  >,
  writer: ProviderEventWriter,
  options: {
    custody?: AccessTokenSource;
    connections?: ProviderConnectionLookup;
  } = {},
) => ({
  commands: repoSlice.commands,
  events: repoSlice.events,
  occurrences: repoSlice.occurrences,
  resources: repoSlice.resources,
  connections: options.connections ?? stubConnectionLookup(),
  writer,
  custody: options.custody ?? tokenSource(),
});

export const providerDeleteDeps = (
  repos: ProviderCommandRepos,
  writer: ProviderEventWriter,
  options: {
    custody?: AccessTokenSource;
    connections?: ProviderConnectionLookup;
  } = {},
) => ({
  ...providerMutationDeps(repos, writer, options),
  markers: repos.markers,
});

export const failingTokenSource = (error: unknown): AccessTokenSource => ({
  getValidAccessToken: async () => {
    throw error;
  },
  discardRevoked: async () => {},
  invalidateAccessToken: async () => {},
});

export class RevokedAuthAdapter implements ProviderAuthAdapter {
  constructor(
    private readonly behavior: {
      refreshError?: unknown;
      refreshed?: RefreshedCredential;
    } = {},
  ) {}
  buildAuthorizationUrl(): string {
    throw new Error("not used");
  }
  exchangeAuthorizationCode(): Promise<never> {
    throw new Error("not used");
  }
  async refreshAccessToken(): Promise<RefreshedCredential> {
    if (this.behavior.refreshError) throw this.behavior.refreshError;
    return (
      this.behavior.refreshed ?? {
        accessToken: "refreshed",
        expiresAt: new Date("2099-01-01T00:00:00Z"),
        grantedScopes: [],
      }
    );
  }
  async revoke(): Promise<void> {}
}

export const storeCommandCredential = async (
  credentials: CredentialRepository,
  connectionId: ConnectionId,
  accessToken?: { token: string; expiresAt: Date },
) => {
  await seedOauthCredential(credentials, {
    connectionId,
    provider: "google",
    refreshToken: "stored-refresh-token",
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
  });
  if (accessToken) {
    await credentials.cacheAccessToken(
      connectionId,
      accessToken.token,
      accessToken.expiresAt,
    );
  }
};

export { TEST_CREDENTIAL_ENCRYPTION_KEY };

// One scriptable writer for every command-path operation. Tests set the
// result/error for the calls they mean to exercise and read the recorded
// inputs; unscripted operations succeed with the defaults below.
export class FakeProviderEventWriter implements ProviderEventWriter {
  createCalls: ProviderCreateInput[] = [];
  patchCalls: ProviderPatchInput[] = [];
  deleteCalls: ProviderDeleteInput[] = [];
  fetchCalls: ProviderFetchInput[] = [];
  fetchInstanceCalls: ProviderInstanceFetchInput[] = [];

  createResult: ProviderWriteResult = {
    providerEventId: "g-evt-1",
    providerVersion: "etag-1",
  };
  patchResult: ProviderWriteResult = {
    providerEventId: "g-evt-1",
    providerVersion: "etag-2",
  };
  createError?: unknown;
  patchError?: unknown;
  instancePatchError?: unknown;
  deleteError?: unknown;
  fetchError?: unknown;
  fetchInstanceError?: unknown;

  // Returned when the requested id matches; unknown ids return null so
  // edit-all override align can exercise delete's 404-OK path.
  fetched: ProviderEvent | null = null;
  matchFetchedById = true;
  // When set (including null), every fetchEvent returns this value instead
  // of matching `fetched` by id. Recurring-scope tests use this.
  fetchEventResult: ProviderEvent | null | undefined = undefined;
  fetchedInstance: ProviderEvent | null = null;

  get calls(): ProviderCreateInput[] {
    return this.createCalls;
  }
  get result(): ProviderWriteResult {
    return this.createResult;
  }
  set result(value: ProviderWriteResult) {
    this.createResult = value;
  }
  get error(): unknown {
    return this.createError;
  }
  set error(value: unknown) {
    this.createError = value;
  }
  get fetchEventCalls(): ProviderFetchInput[] {
    return this.fetchCalls;
  }
  get fetchInstanceResult(): ProviderEvent | null {
    return this.fetchedInstance;
  }
  set fetchInstanceResult(value: ProviderEvent | null) {
    this.fetchedInstance = value;
  }

  async createEvent(input: ProviderCreateInput): Promise<ProviderWriteResult> {
    this.createCalls.push(input);
    if (this.createError) throw this.createError;
    return this.createResult;
  }

  async patchEvent(input: ProviderPatchInput): Promise<ProviderWriteResult> {
    this.patchCalls.push(input);
    if (input.recurrence.kind === "instance" && this.instancePatchError) {
      throw this.instancePatchError;
    }
    if (this.patchError) throw this.patchError;
    return this.patchResult;
  }

  async deleteEvent(input: ProviderDeleteInput): Promise<void> {
    this.deleteCalls.push(input);
    if (this.deleteError) throw this.deleteError;
  }

  async fetchEvent(input: ProviderFetchInput): Promise<ProviderEvent | null> {
    this.fetchCalls.push(input);
    if (this.fetchError) throw this.fetchError;
    if (this.fetchEventResult !== undefined) return this.fetchEventResult;
    if (
      this.fetched &&
      (!this.matchFetchedById ||
        input.providerEventId === this.fetched.providerEventId)
    ) {
      return this.fetched;
    }
    return null;
  }

  async fetchInstanceAt(
    input: ProviderInstanceFetchInput,
  ): Promise<ProviderEvent | null> {
    this.fetchInstanceCalls.push(input);
    if (this.fetchInstanceError) throw this.fetchInstanceError;
    return this.fetchedInstance;
  }
}
