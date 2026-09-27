import { type UserMetadata, type UserProfile } from "@core/types/user.types";
import { BaseApi } from "@web/api/base/base.api";

const UserApi = {
  async deleteAccount(): Promise<void> {
    await BaseApi.delete(`/user`);
  },

  async getProfile(): Promise<UserProfile> {
    const response = await BaseApi.get<UserProfile>(`/user/profile`);
    return response.data;
  },

  async getMetadata(): Promise<UserMetadata> {
    const response = await BaseApi.get<UserMetadata>(`/user/metadata`);
    return response.data;
  },

  async updateMetadata(data: UserMetadata): Promise<UserMetadata> {
    const response = await BaseApi.post<UserMetadata>(`/user/metadata`, data);

    return response.data;
  },
};

export { UserApi };
