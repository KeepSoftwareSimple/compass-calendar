import { publicBookingHttp } from "@booking-web/api/public-booking-http";
import {
  AdminGetBookingPageResponseSchema,
  type AdminGetBookingPageResult,
  AdminGetBookingPageSetupResponseSchema,
  isSavedBookingPage,
} from "@core/types/booking.contracts";

const parseHostBookingPage = (data: unknown): AdminGetBookingPageResult =>
  isSavedBookingPage(data)
    ? AdminGetBookingPageResponseSchema.parse(data)
    : AdminGetBookingPageSetupResponseSchema.parse(data);

/** Host meeting-page settings (`GET /api/booking/page`), session required. */
export const HostBookingApi = {
  async getPage(): Promise<AdminGetBookingPageResult> {
    const data = await publicBookingHttp.get<unknown>("/booking/page");
    return parseHostBookingPage(data);
  },
};
