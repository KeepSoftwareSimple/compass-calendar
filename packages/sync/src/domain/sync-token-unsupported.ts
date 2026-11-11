// Incremental pulls that 410 immediately after a successful repair, without a
// cursor ever surviving, enter sync-token-unsupported mode at this streak. The
// first two laps stay free so an ordinary aged-out token still heals in place.
export const SYNC_TOKEN_UNSUPPORTED_ENTER_STREAK = 3;

// Full calendar-list passes clear verdicts older than this so each calendar gets
// at most one token re-probe per day (mirrors watchUnsupportedAt).
export const SYNC_TOKEN_UNSUPPORTED_RETRY_AFTER_MS = 24 * 60 * 60_000;
