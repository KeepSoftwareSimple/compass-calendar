import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_SEPARATOR = ".";

export const createUnsubscribeToken = (
  userId: string,
  secret: string,
): string => {
  const mac = createHmac("sha256", secret)
    .update(userId, "utf8")
    .digest("base64url");
  return `${userId}${TOKEN_SEPARATOR}${mac}`;
};

export const verifyUnsubscribeToken = (
  token: string,
  secret: string,
): string | null => {
  const separatorIndex = token.lastIndexOf(TOKEN_SEPARATOR);
  if (separatorIndex <= 0) {
    return null;
  }
  const userId = token.slice(0, separatorIndex);
  const mac = token.slice(separatorIndex + 1);
  if (!userId || !mac) {
    return null;
  }

  const expected = createHmac("sha256", secret)
    .update(userId, "utf8")
    .digest("base64url");
  const received = Buffer.from(mac, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  if (received.length !== expectedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(received, expectedBuffer)) {
    return null;
  }
  return userId;
};
