import { type CalendarId } from "@core/types/domain-primitives";
import {
  type AvailabilityResponse,
  AvailabilityResponseSchema,
} from "@core/types/event-command.contracts";
import { BaseApi } from "@web/api/base/base.api";

export interface AvailabilityQueryParams {
  calendarIds: CalendarId[];
  start: string;
  end: string;
}

// calendarIds travels as a single comma-separated query param (mirrors
// event.api.ts's buildListQueryString). The backend
// (calendar.controller.ts's parseAvailabilityQuery) parses the exact same
// format.
const AvailabilityApi = {
  query: async ({
    calendarIds,
    start,
    end,
  }: AvailabilityQueryParams): Promise<AvailabilityResponse> => {
    const params = new URLSearchParams();
    params.set("calendarIds", calendarIds.join(","));
    params.set("start", start);
    params.set("end", end);

    const response = await BaseApi.get<unknown>(
      `/calendars/availability?${params.toString()}`,
    );
    return AvailabilityResponseSchema.parse(response.data);
  },
};

export { AvailabilityApi };
