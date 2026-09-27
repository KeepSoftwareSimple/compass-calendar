import { type AppConfig, AppConfigSchema } from "@core/types/config.types";
import { BaseApi } from "@web/api/base/base.api";

const AppConfigApi = {
  async get(): Promise<AppConfig> {
    const response = await BaseApi.get<AppConfig>(`/config`);
    return AppConfigSchema.parse(response.data);
  },
};

export { AppConfigApi };
