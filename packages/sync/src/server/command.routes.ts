import { type Express, type RequestHandler } from "express";
import { Status } from "@core/errors/status.codes";
import { Logger } from "@core/logger/winston.logger";
import {
  CommandSubmitRequestSchema,
  type CommandSubmitResponse,
  type SyncCommand,
  SyncCommandSchema,
} from "@core/types/sync/command.contracts";
import { type SyncExecutionMode } from "@sync/config/sync.config";
import { CredentialCustody } from "@sync/credentials/credential-custody.service";
import {
  ProviderWriteUnavailableError,
  submitCloudCommand,
} from "@sync/domain/cloud-command.service";
import {
  type ProviderRegistry,
  resolveAdaptersFrom,
  resolveAuthFrom,
} from "@sync/providers/provider-registry";
import { redactedCause } from "@sync/safety/redact-error";
import {
  ensureConnected,
  internalRateLimit,
  requireAuth,
  respondInternalError,
} from "@sync/server/internal-http";
import { type CommandRecord } from "@sync/storage/contracts/command.contracts";
import { type SyncMongoService } from "@sync/storage/sync-mongo.service";
import { syncRepositories } from "@sync/storage/sync-repositories";

export const COMMANDS_PATH = "/internal/commands";

const logger = Logger("sync:command.routes");

export interface CommandApiDeps {
  authMiddleware: RequestHandler;
  mongo: SyncMongoService;
  // Whether provider work is enabled. A provider-targeted create executes only
  // when active; otherwise it is recorded pending.
  execution: SyncExecutionMode;
  // Provider registry, present only when at least one provider is configured.
  // A provider-targeted create executes through the connection's kind.
  registry: ProviderRegistry;
  // AES-256-GCM key for password credentials at rest. Optional so Google-only
  // tests keep constructing custody without a key.
  credentialAtRestKey?: string;
  // Injectable clock so local confirmation timestamps are deterministic in
  // tests.
  now?: () => number;
}

// Internal, authenticated command ingress. Durably records acknowledged user
// intent for one event mutation. A cloud-only create is applied to the
// canonical store and confirmed locally in the same request — no provider call
// — so this is served in passive mode too. The tenant/principal come from the
// signed auth context, never the body, so a caller only ever writes to its own
// principal.
export function registerCommandRoutes(
  app: Express,
  deps: CommandApiDeps,
): void {
  app.post(
    COMMANDS_PATH,
    internalRateLimit,
    deps.authMiddleware,
    async (req, res) => {
      const auth = requireAuth(req, res);
      if (!auth) return;
      if (!ensureConnected(deps.mongo, res)) return;

      const parsed = CommandSubmitRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(Status.BAD_REQUEST).json({ error: "invalid_command" });
        return;
      }
      const request = parsed.data;

      try {
        const repos = syncRepositories(deps.mongo);
        // Build the provider write capability only when both adapters exist;
        // custody is per-request (it holds the request's db-backed credential
        // repo), the writer is shared.
        const provider =
          deps.registry.kinds().length > 0
            ? {
                resolveAdapters: resolveAdaptersFrom(deps.registry),
                custody: new CredentialCustody(
                  repos.credentials,
                  resolveAuthFrom(deps.registry),
                  undefined,
                  undefined,
                  deps.credentialAtRestKey,
                ),
              }
            : undefined;

        const events = repos.events;
        // Snapshot calendarId before apply: a confirmed delete removes the
        // event row, and the change-feed still needs an eventsChanged notice
        // so the SPA (and other tabs) drop it without a manual reload.
        const before = await events.findById(
          auth.tenantId,
          auth.principalId,
          request.eventId,
        );

        const { command, changed } = await submitCloudCommand(
          {
            commands: repos.commands,
            events,
            calendars: repos.calendars,
            occurrences: repos.eventOccurrences,
            resources: repos.syncResources,
            connections: repos.connections,
            markers: repos.deletionMarkers,
            execution: deps.execution,
            provider,
          },
          {
            tenantId: auth.tenantId,
            principalId: auth.principalId,
            idempotencyKey: request.idempotencyKey,
            eventId: request.eventId,
            input: request.input,
            expectedVersion: request.expectedVersion,
            ...(request.restore ? { restore: true as const } : {}),
          },
          () => (deps.now ? new Date(deps.now()) : new Date()),
        );

        // Content-free change-feed notice for Compass API → browser SSE.
        // Emitted only when this request durably changed command/event state,
        // so an idempotent replay does not duplicate outbox rows.
        if (changed) {
          const after = await events.findById(
            auth.tenantId,
            auth.principalId,
            command.eventId,
          );
          const calendarId = after?.calendarId ?? before?.calendarId;
          const invalidations = repos.invalidations;
          const emittedAt = deps.now ? new Date(deps.now()) : new Date();
          const notices = [
            {
              kind: "command" as const,
              commandId: command._id,
            },
            ...(calendarId
              ? [
                  {
                    kind: "event" as const,
                    eventId: command.eventId,
                    calendarId,
                  },
                ]
              : []),
          ];
          await invalidations.appendMany(
            auth.tenantId,
            auth.principalId,
            notices,
            emittedAt,
          );
        }

        // A failed outcome is a clean 200 to the caller, so without this line
        // a deterministic provider refusal (e.g. Google declining a birthday
        // occurrence delete) leaves zero server-side trace — diagnosing one
        // required correlating client 502s against provider logs by hand.
        if (command.outcome.state === "failed") {
          logger.warn(
            `Command ${command._id} (${command.input.kind} ${command.eventId}) failed: ${command.outcome.failureReason}`,
          );
        }

        const response: CommandSubmitResponse = {
          command: toSyncCommand(command),
        };
        res.status(Status.OK).json(response);
      } catch (error) {
        // Provider writes being unavailable is a retryable service state, not a
        // bug: answer 503 so the caller retries instead of believing a write
        // landed that nothing will ever apply.
        if (error instanceof ProviderWriteUnavailableError) {
          res
            .status(Status.SERVICE_UNAVAILABLE)
            .json({ error: "provider_write_unavailable" });
          return;
        }
        logger.error("Failed to submit command", redactedCause(error));
        respondInternalError(res);
      }
    },
  );
}

// Map a stored command record (Date timestamps) to the wire contract (ISO
// strings), validated through the schema on the way out so a row that somehow
// violates the contract fails here rather than reaching the caller malformed.
export function toSyncCommand(record: CommandRecord): SyncCommand {
  return SyncCommandSchema.parse({
    id: record._id,
    tenantId: record.tenantId,
    principalId: record.principalId,
    idempotencyKey: record.idempotencyKey,
    eventId: record.eventId,
    input: record.input,
    expectedVersion: record.expectedVersion,
    outcome: record.outcome,
    attemptCount: record.attemptCount,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}
