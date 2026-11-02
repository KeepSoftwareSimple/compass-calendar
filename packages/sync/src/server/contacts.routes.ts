import { type Express, type RequestHandler } from "express";
import { Status } from "@core/errors/status.codes";
import { Logger } from "@core/logger/winston.logger";
import {
  GOOGLE_SCOPE_CONTACTS_OTHER_READONLY,
  GOOGLE_SCOPE_CONTACTS_READONLY,
} from "@core/providers/google.scopes";
import { MICROSOFT_SCOPE_PEOPLE_READ } from "@core/providers/microsoft.scopes";
import {
  CONTACT_SUGGESTION_MAX_RESULTS,
  CONTACT_SUGGESTION_QUERY_MAX_LENGTH,
  CONTACT_SUGGESTION_QUERY_MIN_LENGTH,
  type ContactSuggestion,
  ContactSuggestionsResponseSchema,
} from "@core/types/contact.contracts";
import { type SyncExecutionMode } from "@sync/config/sync.config";
import { CredentialCustody } from "@sync/credentials/credential-custody.service";
import { ProviderAuthError } from "@sync/providers/provider-auth.port";
import {
  type ContactsPort,
  ContactsSearchError,
} from "@sync/providers/provider-contacts.port";
import {
  type ProviderRegistry,
  resolveAuthFrom,
} from "@sync/providers/provider-registry";
import { redactedCause } from "@sync/safety/redact-error";
import {
  ensureConnected,
  internalRateLimit,
  requireAuth,
  respondInternalError,
} from "@sync/server/internal-http";
import { isOauthRefreshCredential } from "@sync/storage/contracts/credential.contracts";
import { type ProviderConnectionRecord } from "@sync/storage/contracts/provider-connection.contracts";
import { type CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { type SyncMongoService } from "@sync/storage/sync-mongo.service";
import { syncRepositories } from "@sync/storage/sync-repositories";

const logger = Logger("sync:contacts.routes");

export const CONTACTS_SUGGESTIONS_PATH = "/internal/contacts/suggestions";

export interface ContactsApiDeps {
  authMiddleware: RequestHandler;
  mongo: SyncMongoService;
  // Suggestions call the provider, so a passive deployment refuses.
  execution: SyncExecutionMode;
  registry: ProviderRegistry;
  credentialAtRestKey?: string;
}

// Internal, authenticated attendee-suggestion lookup. Principal-scoped: the
// tenant/principal come from the signed auth context. Results are the user's
// past guests (from their own synced events) followed by contacts from each
// connection that granted a contacts scope. The response carries
// {email, displayName} pairs and NOTHING else; neither the query nor any
// contact content is ever logged.
export function registerContactsRoutes(
  app: Express,
  deps: ContactsApiDeps,
): void {
  app.get(
    CONTACTS_SUGGESTIONS_PATH,
    internalRateLimit,
    deps.authMiddleware,
    async (req, res) => {
      const auth = requireAuth(req, res);
      if (!auth) return;
      if (!ensureConnected(deps.mongo, res)) return;
      // Contact lookups touch the provider (contacts are never cached), so a
      // passive or unconfigured service refuses like begin does; the active
      // service answers past guests and contacts together.
      if (deps.execution === "passive" || deps.registry.kinds().length === 0) {
        res.status(Status.CONFLICT).json({ error: "provider_work_disabled" });
        return;
      }

      const rawQuery = req.query["q"];
      if (
        typeof rawQuery !== "string" ||
        rawQuery.length > CONTACT_SUGGESTION_QUERY_MAX_LENGTH
      ) {
        res.status(Status.BAD_REQUEST).json({ error: "invalid_query" });
        return;
      }
      const query = rawQuery.trim();
      // A sub-minimum prefix matches half an address book: empty result,
      // no read, no provider call, no quota burned.
      if (query.length < CONTACT_SUGGESTION_QUERY_MIN_LENGTH) {
        res
          .status(Status.OK)
          .json(ContactSuggestionsResponseSchema.parse({ suggestions: [] }));
        return;
      }

      try {
        const repos = syncRepositories(deps.mongo);
        const connections = await repos.connections.listByPrincipal(
          auth.tenantId,
          auth.principalId,
        );
        const ownEmails = connections.flatMap((connection) =>
          connection.account.email
            ? [connection.account.email.toLowerCase()]
            : [],
        );

        // Past guests come first: people the user already meets with, from
        // every connected account, with no contacts grant needed.
        const collected: ContactSuggestion[] =
          await repos.events.searchPastGuests(
            auth.tenantId,
            auth.principalId,
            query,
            {
              excludeEmails: ownEmails,
              limit: CONTACT_SUGGESTION_MAX_RESULTS,
            },
          );

        // Then each account that granted contacts. One account failing
        // (throttled, revoked) never blanks the others' results.
        const custody = new CredentialCustody(
          repos.credentials,
          resolveAuthFrom(deps.registry),
          undefined,
          undefined,
          deps.credentialAtRestKey,
        );
        for (const connection of connections) {
          if (!connection.capabilities.includes("suggestContacts")) continue;
          if (!deps.registry.has(connection.provider)) continue;
          const contacts = deps.registry.get(connection.provider).adapters
            .contacts;
          if (!contacts) continue;
          try {
            collected.push(
              ...(await searchConnection(
                contacts,
                custody,
                repos.credentials,
                connection,
                query,
              )),
            );
          } catch (error) {
            if (
              !(error instanceof ContactsSearchError) &&
              !(error instanceof ProviderAuthError)
            ) {
              throw error;
            }
            // Static line, response-fact-only cause: never the query or
            // contact content.
            logger.warn(
              "Contact search failed for one account",
              redactedCause(error),
            );
          }
        }

        res.status(Status.OK).json(
          ContactSuggestionsResponseSchema.parse({
            suggestions: dedupeByEmail(collected)
              .filter(
                (suggestion) =>
                  !ownEmails.includes(suggestion.email.toLowerCase()),
              )
              .slice(0, CONTACT_SUGGESTION_MAX_RESULTS),
          }),
        );
      } catch (error) {
        logger.error(
          "Failed to serve contact suggestions",
          redactedCause(error),
        );
        respondInternalError(res);
      }
    },
  );
}

// Query one connection's granted People surfaces. The credential record is
// consulted ONLY for its granted scopes (which surfaces the user consented
// to); a connection without a stored credential (e.g. just disconnected)
// contributes nothing rather than failing the request.
async function searchConnection(
  contacts: ContactsPort,
  custody: CredentialCustody,
  credentials: CredentialRepository,
  connection: ProviderConnectionRecord,
  query: string,
): Promise<ContactSuggestion[]> {
  const credential = await credentials.findByConnection(connection._id);
  if (!credential || !isOauthRefreshCredential(credential)) return [];
  const granted = new Set(credential.scopes);
  const sources = contactsSourcesFor(connection.provider, granted);
  if (!sources.contacts && !sources.otherContacts) return [];

  const accessToken = await custody.getValidAccessToken(connection._id);
  return contacts.searchContacts({ accessToken, query, sources });
}

function contactsSourcesFor(
  provider: ProviderConnectionRecord["provider"],
  granted: Set<string>,
): { contacts: boolean; otherContacts: boolean } {
  if (provider === "microsoft") {
    return {
      contacts: granted.has(MICROSOFT_SCOPE_PEOPLE_READ),
      otherContacts: false,
    };
  }
  return {
    contacts: granted.has(GOOGLE_SCOPE_CONTACTS_READONLY),
    otherContacts: granted.has(GOOGLE_SCOPE_CONTACTS_OTHER_READONLY),
  };
}

// Across connections the same address can appear twice; keep the first
// occurrence (connection listing order, each list already ranked).
function dedupeByEmail(
  suggestions: readonly ContactSuggestion[],
): ContactSuggestion[] {
  const seen = new Set<string>();
  const unique: ContactSuggestion[] = [];
  for (const suggestion of suggestions) {
    const key = suggestion.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(suggestion);
  }
  return unique;
}
