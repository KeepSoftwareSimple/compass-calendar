import { type Calendar } from "@core/types/calendar.contracts";
import {
  type ProviderKind,
  ProviderKindSchema,
  providerDisplayName,
} from "@core/types/sync/identity.contracts";
import { type SyncConnectionSummary } from "@core/types/user.types";

export const ALL_PROVIDER_KINDS: ProviderKind[] = [
  "google",
  "microsoft",
  "apple",
];

/** Missing `provider` on legacy payloads means Google. */
export const connectionProviderKind = (
  connection?: Pick<SyncConnectionSummary, "provider"> | null,
): ProviderKind => connection?.provider ?? "google";

/**
 * The provider account a calendar belongs to; undefined for the local
 * calendar, whose `provider` is outside ProviderKind.
 */
export const calendarProviderKind = (
  calendar: Pick<Calendar, "provider">,
): ProviderKind | undefined => {
  const parsed = ProviderKindSchema.safeParse(calendar.provider);
  return parsed.success ? parsed.data : undefined;
};

export const openingProviderLabel = (kind: ProviderKind): string =>
  kind === "google"
    ? "Opening Google…"
    : `Opening ${providerDisplayName(kind)}…`;
