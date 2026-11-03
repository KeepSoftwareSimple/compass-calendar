import {
  LifePreferencesResponseSchema,
  type ReflectionPreferences,
  ReflectionPreferencesResponseSchema,
  type SaveLifePreferences,
} from "@core/types/life-preferences.contracts";
import { type UserMetadata, type UserProfile } from "@core/types/user.types";
import { BaseApi } from "@web/api/base/base.api";

const UserApi = {
  async getReflectionPreferences() {
    return ReflectionPreferencesResponseSchema.parse(
      (await BaseApi.get("/user/reflection-preferences")).data,
    );
  },
  async saveReflectionPreferences(input: ReflectionPreferences) {
    return ReflectionPreferencesResponseSchema.parse(
      (await BaseApi.put("/user/reflection-preferences", input)).data,
    );
  },
  async updateReflectionCalendarVisibility(
    calendarId: string,
    isVisible: boolean,
  ) {
    await BaseApi.patch("/user/reflection-calendar-visibility", {
      calendarId,
      isVisible,
    });
  },
  async getLifePreferences() {
    return LifePreferencesResponseSchema.parse(
      (await BaseApi.get("/user/life-preferences")).data,
    );
  },
  async saveLifePreferences(input: SaveLifePreferences) {
    return LifePreferencesResponseSchema.parse(
      (await BaseApi.put("/user/life-preferences", input)).data,
    );
  },
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

  async updateMetadata(data: Partial<UserMetadata>): Promise<UserMetadata> {
    const response = await BaseApi.post<UserMetadata>(`/user/metadata`, data);

    return response.data;
  },
};

export { UserApi };
