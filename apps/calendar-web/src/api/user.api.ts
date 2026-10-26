import { type UserMetadata, type UserProfile } from "@core/types/user.types";
import { BaseApi } from "@web/api/base/base.api";

/** Hung GET /user/metadata must not hold refreshUserMetadata single-flight forever. */
export const USER_METADATA_REQUEST_TIMEOUT_MS = 30_000;

const UserApi = {
  async deleteAccount(): Promise<void> {
    await BaseApi.delete(`/user`);
  },

  async getProfile(): Promise<UserProfile> {
    const response = await BaseApi.get<UserProfile>(`/user/profile`);
    return response.data;
  },

  async getMetadata(): Promise<UserMetadata> {
    const response = await BaseApi.get<UserMetadata>(`/user/metadata`, {
      signal: AbortSignal.timeout(USER_METADATA_REQUEST_TIMEOUT_MS),
    });
    return response.data;
  },

  async updateMetadata(data: Partial<UserMetadata>): Promise<UserMetadata> {
    const response = await BaseApi.post<UserMetadata>(`/user/metadata`, data);

    return response.data;
  },
};

export { UserApi };
