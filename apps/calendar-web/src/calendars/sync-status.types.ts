export type SyncStatusVariant = "syncing" | "healthy" | "warning" | "error";

export type SyncStatus = { variant: SyncStatusVariant; text: string } | null;

// Status is conveyed as text, never colour alone; this map only decorates a
// message that already says what is happening. Shared by the account list
// header and the per-account section headers so the two surfaces a user
// directly compares cannot drift.
export const SYNC_STATUS_VARIANT_CLASSNAME: Record<SyncStatusVariant, string> =
  {
    syncing: "c-sync-text-wave",
    healthy: "text-text",
    warning: "text-warning",
    error: "text-error",
  };
