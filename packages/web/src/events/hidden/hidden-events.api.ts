import {
  HiddenEventIdsResponseSchema,
  type SetEventHiddenInput,
  SetEventHiddenInputSchema,
} from "@core/types/event-visibility.contracts";
import { BaseApi } from "@web/api/base/base.api";

const HiddenEventsApi = {
  list: async (): Promise<readonly string[]> => {
    const response = await BaseApi.get<unknown>("/user/hidden-events");
    return HiddenEventIdsResponseSchema.parse(response.data).hiddenEventIds;
  },

  set: async (input: SetEventHiddenInput): Promise<readonly string[]> => {
    const response = await BaseApi.put<unknown>(
      "/user/hidden-events",
      SetEventHiddenInputSchema.parse(input),
    );
    return HiddenEventIdsResponseSchema.parse(response.data).hiddenEventIds;
  },
};

export { HiddenEventsApi };
