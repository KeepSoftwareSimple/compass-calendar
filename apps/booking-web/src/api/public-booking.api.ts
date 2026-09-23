import {
  getErrorStatus,
  publicBookingHttp,
} from "@booking-web/api/public-booking-http";
import {
  type BookingReservationSlotsQuery,
  BookingReservationSlotsQuerySchema,
  type BookingSlotsQuery,
  BookingSlotsQuerySchema,
  type BookingSlotsResponse,
  BookingSlotsResponseSchema,
  type CancelBookingReservationInput,
  CancelBookingReservationInputSchema,
  type CreateBookingReservationInput,
  CreateBookingReservationInputSchema,
  type CreateBookingReservationResponse,
  CreateBookingReservationResponseSchema,
  type PatchBookingReservationInput,
  PatchBookingReservationInputSchema,
  type PublicGetBookingPageResponse,
  PublicGetBookingPageResponseSchema,
  type PublicGetBookingReservationResponse,
  PublicGetBookingReservationResponseSchema,
  type RescheduleBookingReservationInput,
  RescheduleBookingReservationInputSchema,
  type RescheduleBookingReservationResponse,
  RescheduleBookingReservationResponseSchema,
} from "@core/types/booking.contracts";

export class PublicBookingNotFoundError extends Error {
  constructor() {
    super("Meeting page not found");
    this.name = "PublicBookingNotFoundError";
  }
}

async function rejectNotFound<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (error) {
    if (getErrorStatus(error) === 404) {
      throw new PublicBookingNotFoundError();
    }
    throw error;
  }
}

const PublicBookingApi = {
  async getPage(slug: string): Promise<PublicGetBookingPageResponse> {
    const data = await rejectNotFound(
      publicBookingHttp.get<unknown>(
        `/booking/pages/${encodeURIComponent(slug)}`,
      ),
    );
    return PublicGetBookingPageResponseSchema.parse(data);
  },

  async getSlots(
    slug: string,
    query: BookingSlotsQuery,
    signal?: AbortSignal,
  ): Promise<BookingSlotsResponse> {
    const parsed = BookingSlotsQuerySchema.parse(query);
    const params = new URLSearchParams({
      start: parsed.start,
      end: parsed.end,
      timeZone: parsed.timeZone,
    });
    const data = await publicBookingHttp.get<unknown>(
      `/booking/pages/${encodeURIComponent(slug)}/slots?${params.toString()}`,
      signal,
    );
    return BookingSlotsResponseSchema.parse(data);
  },

  async createReservation(
    slug: string,
    input: CreateBookingReservationInput,
  ): Promise<CreateBookingReservationResponse> {
    const parsed = CreateBookingReservationInputSchema.parse(input);
    const data = await publicBookingHttp.post<unknown>(
      `/booking/pages/${encodeURIComponent(slug)}/reservations`,
      parsed,
    );
    return CreateBookingReservationResponseSchema.parse(data);
  },

  async getReservation(
    reservationId: string,
  ): Promise<PublicGetBookingReservationResponse> {
    const data = await rejectNotFound(
      publicBookingHttp.get<unknown>(
        `/booking/reservations/${encodeURIComponent(reservationId)}`,
      ),
    );
    return PublicGetBookingReservationResponseSchema.parse(data);
  },

  async patchReservation(
    reservationId: string,
    input: PatchBookingReservationInput,
  ): Promise<PublicGetBookingReservationResponse> {
    const parsed = PatchBookingReservationInputSchema.parse(input);
    const data = await rejectNotFound(
      publicBookingHttp.patch<unknown>(
        `/booking/reservations/${encodeURIComponent(reservationId)}`,
        parsed,
      ),
    );
    return PublicGetBookingReservationResponseSchema.parse(data);
  },

  async cancelReservation(
    reservationId: string,
    input: CancelBookingReservationInput,
  ): Promise<void> {
    const parsed = CancelBookingReservationInputSchema.parse(input);
    await publicBookingHttp.post(
      `/booking/reservations/${encodeURIComponent(reservationId)}/cancel`,
      parsed,
    );
  },

  async getReservationSlots(
    reservationId: string,
    query: BookingReservationSlotsQuery,
    signal?: AbortSignal,
  ): Promise<BookingSlotsResponse> {
    const parsed = BookingReservationSlotsQuerySchema.parse(query);
    const params = new URLSearchParams({
      token: parsed.token,
      start: parsed.start,
      end: parsed.end,
      timeZone: parsed.timeZone,
    });
    const data = await rejectNotFound(
      publicBookingHttp.get<unknown>(
        `/booking/reservations/${encodeURIComponent(reservationId)}/slots?${params.toString()}`,
        signal,
      ),
    );
    return BookingSlotsResponseSchema.parse(data);
  },

  async rescheduleReservation(
    reservationId: string,
    input: RescheduleBookingReservationInput,
  ): Promise<RescheduleBookingReservationResponse> {
    const parsed = RescheduleBookingReservationInputSchema.parse(input);
    const data = await rejectNotFound(
      publicBookingHttp.post<unknown>(
        `/booking/reservations/${encodeURIComponent(reservationId)}/reschedule`,
        parsed,
      ),
    );
    return RescheduleBookingReservationResponseSchema.parse(data);
  },
};

export { PublicBookingApi };
