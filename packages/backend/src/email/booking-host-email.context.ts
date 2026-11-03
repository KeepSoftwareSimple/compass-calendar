import { type ObjectId } from "mongodb";
import { type CalendarConference } from "@core/types/calendar.contracts";
import { bookingPageRepository } from "@backend/booking/booking-page.repository";
import { bookingReservationRepository } from "@backend/booking/booking-reservation.repository";
import { resolveBookingDestinationConference } from "@backend/booking/services/destination-conference";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import { durationMinutesForHostEmail } from "@backend/email/booking-host-email.content";
import { weekDateKeyForInstant } from "@backend/email/booking-host-email.format";

export type BookingHostEmailDispatchContext = {
  user: {
    email: string;
    firstName: string;
    isSynthetic?: boolean;
    emailPreferences?: {
      unsubscribedAt?: Date;
      suppressedAt?: Date;
      bookingHostEmailDisabledAt?: Date;
    };
  };
  reservation: NonNullable<
    Awaited<ReturnType<typeof bookingReservationRepository.findById>>
  >;
  page: NonNullable<Awaited<ReturnType<typeof bookingPageRepository.findById>>>;
  durationMinutes: number;
  conference: CalendarConference;
  openInCompassUrl: string;
};

export async function loadBookingHostEmailDispatchContext(input: {
  userId: ObjectId;
  reservationId: ObjectId;
}): Promise<BookingHostEmailDispatchContext | null> {
  const user = await mongoService.user.findOne(
    { _id: input.userId },
    {
      projection: {
        email: 1,
        firstName: 1,
        isSynthetic: 1,
        emailPreferences: 1,
      },
    },
  );
  if (!user?.email?.trim()) {
    return null;
  }

  const reservation = await bookingReservationRepository.findById(
    input.reservationId,
  );
  if (!reservation) {
    return null;
  }

  const page = await bookingPageRepository.findById(reservation.pageId);
  if (!page?.enabled) {
    return null;
  }

  const conference = await resolveBookingDestinationConference(
    page.userId,
    page.destinationCalendarId,
  );
  const weekKey = weekDateKeyForInstant(reservation.slotStart, page.timeZone);
  const openInCompassUrl = `${CONFIG.FRONTEND_URL.replace(/\/$/, "")}/week/${weekKey}`;

  return {
    user: {
      email: user.email,
      firstName: user.firstName,
      isSynthetic: user.isSynthetic,
      emailPreferences: user.emailPreferences,
    },
    reservation,
    page,
    durationMinutes: durationMinutesForHostEmail(
      reservation,
      page.durationMinutes,
    ),
    conference,
    openInCompassUrl,
  };
}
