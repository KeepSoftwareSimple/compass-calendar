import { type Response } from "express";
import { type SessionRequest } from "supertokens-node/framework/express";
import { Status } from "@core/errors/status.codes";
import { Logger } from "@core/logger/winston.logger";
import {
  CONTACT_SUGGESTION_QUERY_MAX_LENGTH,
  CONTACT_SUGGESTION_QUERY_MIN_LENGTH,
  type ContactSuggestionsResponse,
} from "@core/types/contact.contracts";
import { zObjectId } from "@core/types/object-id.schema";
import { toSyncPrincipal } from "@backend/common/services/sync-service/sync-principal";
import { logLevelForSyncClientError } from "@backend/common/services/sync-service/sync-proxy-error";
import { type SyncClientError } from "@backend/common/services/sync-service/sync-service.client";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";

const logger = Logger("app:contacts.controller");

const EMPTY_SUGGESTIONS: ContactSuggestionsResponse = { suggestions: [] };

// The ONLY log line this controller emits, built from the sync client's
// content-free error facts alone — never from the query or a response body.
// Exported so a test pins that property against future edits.
export function contactSuggestionsFailureLogLine(
  error: SyncClientError,
): string {
  return (
    `Contact suggestions unavailable (${error.kind}` +
    `${error.status !== undefined ? ` ${error.status}` : ""}) ` +
    `[correlationId=${error.correlationId}]`
  );
}

/**
 * Browser proxy for sync's contact-suggestion lookup (attendee type-ahead).
 *
 * Suggestions are a convenience, never load-bearing: EVERY sync-side failure
 * — sync down, passive mode, capability revoked mid-session (403), rate
 * limit — degrades to a typed empty 200 so the attendee field silently falls
 * back to raw email entry instead of firing an error toast per keystroke.
 * Only a malformed browser request is a 400.
 *
 * Privacy: neither the query nor any suggestion content is ever logged —
 * log lines are static text plus the sync client's content-free error facts
 * (kind/status/correlationId).
 */
class ContactsController {
  suggestions = async (req: SessionRequest, res: Response) => {
    const userId = req.session?.getUserId();
    const parsedUserId = zObjectId.safeParse(userId);
    if (!parsedUserId.success) {
      res.status(Status.UNAUTHORIZED).json({ error: "unauthorized" });
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

    // Below the minimum the answer is empty by contract (sync would answer
    // the same) — skip the round-trip entirely.
    const query = rawQuery.trim();
    if (query.length < CONTACT_SUGGESTION_QUERY_MIN_LENGTH) {
      res.status(Status.OK).json(EMPTY_SUGGESTIONS);
      return;
    }

    const client = getSyncServiceClient();
    const result = await client.getContactSuggestions(
      toSyncPrincipal(parsedUserId.data.toString()),
      query,
    );

    if (result.ok) {
      res.status(Status.OK).json(result.value);
      return;
    }

    // Content-free by construction: SyncClientError carries only
    // kind/status/correlationId — never the query or a response body. A 403
    // (no contacts grant — metadata raced a revocation) is an ordinary state,
    // not a defect, so it stays at warn rather than error-tracking level.
    const level =
      result.error.status === Status.FORBIDDEN
        ? "warn"
        : logLevelForSyncClientError(result.error.kind);
    logger[level](contactSuggestionsFailureLogLine(result.error));
    res.status(Status.OK).json(EMPTY_SUGGESTIONS);
  };
}

export default new ContactsController();
