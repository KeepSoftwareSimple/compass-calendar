import { OBJECT_ID_HEX_PATTERN } from "@core/types/type.utils";

/** 24-hex ObjectId without importing bson (keeps bson off the web boot graph). */
export const createObjectIdString = (): string => {
  const bytes = new Uint8Array(12);
  const unixSeconds = Math.floor(Date.now() / 1000);
  bytes[0] = (unixSeconds >>> 24) & 0xff;
  bytes[1] = (unixSeconds >>> 16) & 0xff;
  bytes[2] = (unixSeconds >>> 8) & 0xff;
  bytes[3] = unixSeconds & 0xff;
  crypto.getRandomValues(bytes.subarray(4));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
};

/**
 * ObjectId stores unix seconds in its first 4 bytes (8 hex chars). Used by
 * the IndexedDB migration so boot never loads bson just to call getTimestamp.
 */
export const createdAtFromObjectIdHex = (id: string): string => {
  if (!OBJECT_ID_HEX_PATTERN.test(id)) {
    return new Date().toISOString();
  }
  const unixSeconds = Number.parseInt(id.slice(0, 8), 16);
  if (!Number.isFinite(unixSeconds)) {
    return new Date().toISOString();
  }
  return new Date(unixSeconds * 1000).toISOString();
};
