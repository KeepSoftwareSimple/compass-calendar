/**
 * Client identity for the public booking abuse budget.
 *
 * Express `trust proxy = 1` already picks `req.ip` from the single trusted
 * hop (Caddy). Guests cannot spoof past that. This only normalizes the
 * address Express already chose: strip an IPv4-mapped prefix, drop a
 * trailing IPv4 port, and collapse IPv6 to a /64 so rotating addresses in
 * the same subnet share a bucket.
 */
export function normalizeBookingClientIp(ip: string | undefined): string {
  if (!ip) return "unknown";
  let value = ip.trim().toLowerCase();
  if (value.startsWith("::ffff:")) value = value.slice("::ffff:".length);
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value);
  if (ipv4WithPort) value = ipv4WithPort[1] ?? value;
  if (value.includes(":") && !value.includes(".")) {
    const hextets = value.split(":").filter((part) => part.length > 0);
    if (hextets.length >= 4) return `${hextets.slice(0, 4).join(":")}::`;
  }
  return value;
}

export function bookingPublicRateLimitKey(
  ip: string | undefined,
  target: string | undefined,
): string {
  return `${normalizeBookingClientIp(ip)}:${target && target.length > 0 ? target : "unknown"}`;
}
