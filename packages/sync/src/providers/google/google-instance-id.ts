import {
  type ParsedRecurringInstanceId,
  parseRecurringInstanceEventId,
  recurringInstanceEventId,
} from "@sync/providers/recurring-instance-id";

// Google instance ids are `{seriesId}_{originalStart}`: all-day YYYYMMDD,
// timed YYYYMMDDTHHMMSSZ (always UTC). Compass mints these when addressing an
// occurrence by GET, and Google's incremental cancelled-instance payloads often
// carry only this id (no recurringEventId / originalStartTime). Mint and parse
// must stay byte-identical so a sparse cancellation reconstructs the same
// recurrenceId the series projection uses.

export type ParsedGoogleInstanceId = ParsedRecurringInstanceId;

export const googleInstanceEventId = recurringInstanceEventId;
export const parseGoogleInstanceEventId = parseRecurringInstanceEventId;
