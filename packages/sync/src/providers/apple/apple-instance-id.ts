import {
  parseRecurringInstanceEventId,
  recurringInstanceEventId,
} from "@sync/providers/recurring-instance-id";

// Apple recurring-instance ids mirror Google's `{seriesId}_{originalStart}`
// suffix so sparse cancellations and reader href mappings stay aligned with
// Compass projection recurrenceIds. iCloud shares one UID across master and
// exception VEVENTs in a resource; the suffix disambiguates instances.

export const appleInstanceEventId = recurringInstanceEventId;

export interface ParsedAppleInstanceId {
  readonly seriesUid: string;
  readonly originalStartAt: string;
  readonly scheduleKind: "timed" | "allDay";
}

export function parseAppleInstanceId(
  providerEventId: string,
): ParsedAppleInstanceId | null {
  const parsed = parseRecurringInstanceEventId(providerEventId);
  if (!parsed) return null;
  return {
    seriesUid: parsed.seriesProviderId,
    originalStartAt: parsed.recurrenceId,
    scheduleKind: parsed.scheduleKind,
  };
}
