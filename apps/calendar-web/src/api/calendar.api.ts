import {
  type Calendar,
  CalendarListResponseSchema,
} from "@core/types/calendar.contracts";
import { BaseApi } from "@web/api/base/base.api";

// Visibility is client-owned (localStorage) as of S39 A2 — no PUT /calendars/select.
const CalendarApi = {
  list: async (): Promise<Calendar[]> => {
    const response = await BaseApi.get<unknown>("/calendars");
    return CalendarListResponseSchema.parse(response.data).calendars;
  },
};

export { CalendarApi };
