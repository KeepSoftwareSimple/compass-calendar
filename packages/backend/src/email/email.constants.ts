export const EMAIL_SEND_POLL_INTERVAL_MS = 60_000;
export const EMAIL_SEND_CLAIM_LEASE_MS = 120_000;
export const EMAIL_SEND_MAX_ATTEMPTS = 5;
export const EMAIL_SEND_BATCH_SIZE = 50;
export const EMAIL_SEND_MAX_BACKOFF_MS = 30 * 60 * 1000;

export const emailSendBackoffMs = (attemptCount: number): number => {
  const exponent = Math.min(Math.max(attemptCount, 0), 8);
  return Math.min(EMAIL_SEND_MAX_BACKOFF_MS, 60_000 * 2 ** exponent);
};
