import {
  AdminGetBookingPageResponseSchema,
  type AdminGetBookingPageResult,
  AdminGetBookingPageSetupResponseSchema,
  type AdminPutBookingPageInput,
  type BookingNewMeetingsClaimResponse,
  BookingNewMeetingsClaimResponseSchema,
  type BookingPageStatusResponse,
  BookingPageStatusResponseSchema,
  isSavedBookingPage,
} from "@core/types/booking.contracts";
import { BaseApi } from "@web/api/base/base.api";

const parseBookingPage = (data: unknown): AdminGetBookingPageResult =>
  isSavedBookingPage(data)
    ? AdminGetBookingPageResponseSchema.parse(data)
    : AdminGetBookingPageSetupResponseSchema.parse(data);

const BookingApi = {
  async getPage(): Promise<AdminGetBookingPageResult> {
    const response = await BaseApi.get<unknown>(`/booking/page`);
    return parseBookingPage(response.data);
  },

  async getPageStatus(): Promise<BookingPageStatusResponse> {
    const response = await BaseApi.get<unknown>(`/booking/page/status`);
    return BookingPageStatusResponseSchema.parse(response.data);
  },

  async putPage(
    input: AdminPutBookingPageInput,
  ): Promise<AdminGetBookingPageResult> {
    const response = await BaseApi.put<unknown>(`/booking/page`, input);
    return parseBookingPage(response.data);
  },

  async claimNewMeetings(): Promise<BookingNewMeetingsClaimResponse> {
    const response = await BaseApi.post<unknown>(
      `/booking/page/new-meetings/claim`,
    );
    return BookingNewMeetingsClaimResponseSchema.parse(response.data);
  },
};

export { BookingApi };
