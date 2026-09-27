import { BaseApi } from "@web/api/base/base.api";
import { handleGoogleRevoked } from "@web/auth/providers/connection-revoked.util";

export function configureGoogleRevocationApiHandler(): void {
  BaseApi.defaults.onGoogleRevoked = handleGoogleRevoked;
}
