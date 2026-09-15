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
