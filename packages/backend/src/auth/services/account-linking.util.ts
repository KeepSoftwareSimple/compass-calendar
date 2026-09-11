import { type Schema_UserIdentity } from "@core/types/user.types";
import { normalizeEmail } from "@backend/common/helpers/email.util";

export const APPLE_PRIVATE_RELAY_DOMAIN = "privaterelay.appleid.com";

type LoginMethodFields = {
  google?: { googleId?: string };
  identities?: Schema_UserIdentity[];
};

export function isApplePrivateRelayEmail(email: string): boolean {
  return normalizeEmail(email).endsWith(`@${APPLE_PRIVATE_RELAY_DOMAIN}`);
}

export function emailForVerifiedAccountLinkLookup(
  email: string | null | undefined,
): string | null {
  if (!email?.trim()) {
    return null;
  }
  if (isApplePrivateRelayEmail(email)) {
    return null;
  }
  return email;
}

export function hasVerifiedLoginMethod(user: LoginMethodFields): boolean {
  if (user.google?.googleId) {
    return true;
  }
  return (user.identities?.length ?? 0) > 0;
}

export function canReuseCompassUserByEmail(args: {
  existing: LoginMethodFields;
  incomingHasVerifiedLogin: boolean;
}): boolean {
  return (
    hasVerifiedLoginMethod(args.existing) === args.incomingHasVerifiedLogin
  );
}
