import { CONFIG } from "@backend/common/constants/config.constants";
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "@backend/email/unsubscribe-token";

const extractMailboxDomain = (from: string): string => {
  const match = from.match(/<([^>]+)>/) ?? from.match(/([\w.-]+@[\w.-]+)/);
  const address = match?.[1] ?? from;
  const atIndex = address.lastIndexOf("@");
  if (atIndex <= 0) {
    return "mail.compasscalendar.com";
  }
  return address.slice(atIndex + 1);
};

export function buildUnsubscribeTokenForUser(userId: string): string | null {
  const secret = CONFIG.EMAIL_UNSUBSCRIBE_SECRET;
  if (!secret) {
    return null;
  }
  return createUnsubscribeToken(userId, secret);
}

export function parseUnsubscribeUserId(token: string): string | null {
  const secret = CONFIG.EMAIL_UNSUBSCRIBE_SECRET;
  if (!secret) {
    return null;
  }
  return verifyUnsubscribeToken(token, secret);
}

export function buildUnsubscribeUrls(token: string): {
  httpsUrl: string;
  mailtoUrl: string;
  listUnsubscribeHeader: string;
} {
  const httpsUrl = `${CONFIG.BASEURL}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
  const domain = extractMailboxDomain(CONFIG.EMAIL_FROM ?? "");
  const mailtoUrl = `mailto:unsubscribe@${domain}?subject=${encodeURIComponent("Unsubscribe")}&body=${encodeURIComponent(token)}`;
  const listUnsubscribeHeader = `<${mailtoUrl}>, <${httpsUrl}>`;
  return { httpsUrl, mailtoUrl, listUnsubscribeHeader };
}

export function isEmailSequenceStopped(
  preferences: { unsubscribedAt?: Date; suppressedAt?: Date } | undefined,
): boolean {
  return Boolean(preferences?.unsubscribedAt ?? preferences?.suppressedAt);
}
