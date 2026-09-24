import { type IncomingHttpHeaders } from "node:http";

export function readHttpHeader(
  headers: IncomingHttpHeaders,
  name: string,
): string | undefined {
  const raw = headers[name];
  if (raw === undefined) {
    return undefined;
  }
  return Array.isArray(raw) ? raw[0] : raw;
}
