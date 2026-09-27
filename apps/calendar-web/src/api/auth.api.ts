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

  async beginConnection(
    request: ConnectionBeginRequest = {},
  ): Promise<ConnectionBeginResponse> {
    const provider = request.provider ?? "google";
    const response = await BaseApi.post<ConnectionBeginResponse>(
      `/auth/connections/begin`,
      { ...request, provider },
    );
    return ConnectionBeginResponseSchema.parse(response.data);
  },

  async disconnectConnection(connectionId: string): Promise<void> {
    await BaseApi.delete(
      `/auth/connections/${encodeURIComponent(connectionId)}`,
    );
  },

  async refreshConnections(): Promise<ConnectionRefreshResponse> {
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
