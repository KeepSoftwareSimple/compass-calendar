const UTC_LIKE_TIME_ZONES = new Set(["UTC", "Etc/UTC", "Etc/GMT", "GMT"]);

/** True for zones that render as the UTC grid label (parity harness uses these). */
export function isUtcLikeTimeZone(timeZone: string): boolean {
  return UTC_LIKE_TIME_ZONES.has(timeZone);
}
