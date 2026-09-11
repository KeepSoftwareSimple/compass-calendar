import {
  HiddenEventIdsResponseSchema,
  type SetEventHiddenInput,
  SetEventHiddenInputSchema,
} from "@core/types/event-visibility.contracts";
import { BaseApi } from "@web/api/base/base.api";

const parseHiddenEventIds = (data: unknown): readonly string[] =>
  HiddenEventIdsResponseSchema.parse(data).hiddenEventIds;

const HiddenEventsApi = {
  list: async (): Promise<readonly string[]> => {
    const response = await BaseApi.get<unknown>("/user/hidden-events");
    return parseHiddenEventIds(response.data);
  },

  set: async (input: SetEventHiddenInput): Promise<readonly string[]> => {
    const response = await BaseApi.put<unknown>(
      "/user/hidden-events",
      SetEventHiddenInputSchema.parse(input),
    );
    return parseHiddenEventIds(response.data);
  },
};

export { HiddenEventsApi };
