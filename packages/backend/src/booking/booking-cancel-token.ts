import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const generateCancelToken = (): string =>
  randomBytes(32).toString("base64url");

export const hashCancelToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

export const verifyCancelToken = (
  storedHash: string,
  rawToken: string,
): boolean => {
  const candidateHash = hashCancelToken(rawToken);
  const stored = Buffer.from(storedHash, "utf8");
  const candidate = Buffer.from(candidateHash, "utf8");
  if (stored.length !== candidate.length) {
    return false;
  }
  return timingSafeEqual(stored, candidate);
};

/** Valid while `now` is strictly before `slotEnd` (half-open, like the slot). */
export const guestActionTokenIsLive = (
  slotEnd: Date,
  now: Date = new Date(),
): boolean => now.getTime() < slotEnd.getTime();

export const guestActionTokenAuthorizes = (
  storedHash: string,
  rawToken: string,
  slotEnd: Date,
  now: Date = new Date(),
): boolean => {
  const hashOk = verifyCancelToken(storedHash, rawToken);
  const live = guestActionTokenIsLive(slotEnd, now);
  return hashOk && live;
};

/** Read-only guest views: valid token, including after the slot ends. */
export const guestReadTokenAuthorizes = (
  storedHash: string,
  rawToken: string,
): boolean => verifyCancelToken(storedHash, rawToken);
