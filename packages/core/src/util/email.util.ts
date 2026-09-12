/**
 * The one way an email address is folded before it is compared or stored.
 * Addresses arrive with provider-chosen casing and stray whitespace (OAuth
 * profiles, pasted invites, a typed login), so every comparison has to agree
 * on the same fold or the same person looks like two.
 *
 * Lives in core because both sides need it: the API keys users by it, and the
 * browser matches calendars, connections and reconnect targets against it.
 */
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

/**
 * Normalized form, or null when there is nothing left to compare (absent, or
 * whitespace only). Callers holding an optional address use this instead of
 * repeating the emptiness check: a `""` key would otherwise match every
 * account that reported no email.
 */
export const normalizeEmailOrNull = (
  email: string | null | undefined,
): string | null => {
  if (!email) return null;
  const normalized = normalizeEmail(email);
  return normalized.length > 0 ? normalized : null;
};
