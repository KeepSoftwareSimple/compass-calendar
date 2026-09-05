import {
  type GoogleAuthCodeRequest,
  type Result_Auth_Compass,
} from "@core/types/auth.types";
import {
  type ConnectionBeginConnectedResponse,
  ConnectionBeginConnectedResponseSchema,
  type ConnectionBeginRequest,
  type ConnectionBeginResponse,
  ConnectionBeginResponseSchema,
  type ConnectionRefreshResponse,
  ConnectionRefreshResponseSchema,
  type CredentialConnectPayload,
} from "@core/types/sync/connection.contracts";
import { BaseApi } from "@web/api/base/base.api";
import { type ProviderAuthCodeRequest } from "@web/auth/providers/authorization/provider-authorization.util";

const AuthApi = {
  async loginOrSignup(
    data: GoogleAuthCodeRequest | ProviderAuthCodeRequest,
  ): Promise<Result_Auth_Compass> {
    const response = await BaseApi.post<Result_Auth_Compass>(
      `/signinup`,
      data,
      { headers: { rid: "thirdparty" } },
    );

    return response.data;
  },

  // Ask the backend for the provider consent URL the browser should navigate
  // to (the sync service owns the OAuth round-trip). Pass `connectionId` to
  // reconnect an existing connection; omit it for a fresh one.
  async beginGoogleConnection(
    request: ConnectionBeginRequest = {},
  ): Promise<{ authorizationUrl: string }> {
    const response = await BaseApi.post<ConnectionBeginResponse>(
      `/auth/connections/begin`,
      { ...request, provider: "google" },
    );

    const parsed = ConnectionBeginResponseSchema.parse(response.data);
    if (!("authorizationUrl" in parsed)) {
      throw new Error("Google connect did not return a redirect");
    }
    return { authorizationUrl: parsed.authorizationUrl };
  },

  async beginConnection(
    request: ConnectionBeginRequest = {},
  ): Promise<ConnectionBeginResponse> {
    const provider = request.provider ?? "google";
    if (provider === "google") {
      const { provider: _provider, ...rest } = request;
      const google = await AuthApi.beginGoogleConnection(rest);
      return { kind: "redirect", authorizationUrl: google.authorizationUrl };
    }

    const response = await BaseApi.post<ConnectionBeginResponse>(
      `/auth/connections/begin`,
      { ...request, provider },
    );
    return ConnectionBeginResponseSchema.parse(response.data);
  },

  // Disconnect one connected Google account. The user's other accounts, and
  // their Compass sign-in, are unaffected.
  async disconnectGoogleConnection(connectionId: string): Promise<void> {
    await BaseApi.delete(
      `/auth/connections/${encodeURIComponent(connectionId)}`,
    );
  },

  // Enqueue Sync catch-up pulls for the signed-in user's calendars.
  async refreshGoogleSync(): Promise<ConnectionRefreshResponse> {
    const response = await BaseApi.post<ConnectionRefreshResponse>(
      `/auth/connections/refresh`,
      {},
    );

    return ConnectionRefreshResponseSchema.parse(response.data);
  },

  async connectAppleCredential(
    payload: CredentialConnectPayload,
  ): Promise<ConnectionBeginConnectedResponse> {
    const response = await BaseApi.post(`/auth/connections/credential`, {
      provider: "apple",
      username: payload.username,
      secret: payload.secret,
    });
    return ConnectionBeginConnectedResponseSchema.parse(response.data);
  },
};

export { AuthApi };
