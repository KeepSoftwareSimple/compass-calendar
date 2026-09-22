import { type Request, type Response } from "express";
import { type SessionRequest } from "supertokens-node/framework/express";
import { Status } from "@core/errors/status.codes";
import { type BookingLifecycleOperation } from "@core/types/booking-lifecycle.contracts";
import { zObjectId } from "@core/types/object-id.schema";
import {
  bookingError,
  toBookingErrorResponse,
} from "@backend/booking/booking.error";
import { bookingLifecycleAnalytics } from "@backend/booking/booking-lifecycle.analytics";
import bookingPageService from "@backend/booking/services/booking-page.service";
import publicBookingService from "@backend/booking/services/public-booking.service";

const respondBookingError = (
  res: Response,
  error: unknown,
  operation?: BookingLifecycleOperation,
) => {
  const { status, body } = toBookingErrorResponse(error);
  if (operation) {
    bookingLifecycleAnalytics.emitRequestFailure({
      operation,
      code: body.code,
    });
  }
  res.status(status).json(body);
};

class BookingController {
  getPage = async (req: SessionRequest, res: Response) => {
    try {
      const userId = zObjectId.parse(req.session?.getUserId());
      const response = await bookingPageService.getAdminPage(userId);
      res.status(Status.OK).json(response);
    } catch (error) {
      respondBookingError(res, error);
    }
  };

  getPageStatus = async (req: SessionRequest, res: Response) => {
    try {
      const userId = zObjectId.parse(req.session?.getUserId());
      const response = await publicBookingService.getHostPageStatus(userId);
      res.status(Status.OK).json(response);
    } catch (error) {
      respondBookingError(res, error);
    }
  };

  putPage = async (req: SessionRequest, res: Response) => {
    try {
      const userId = zObjectId.parse(req.session?.getUserId());
      const response = await bookingPageService.putAdminPage(userId, req.body);
      res.status(Status.OK).json(response);
    } catch (error) {
      respondBookingError(res, error);
    }
  };

  claimNewMeetings = async (req: SessionRequest, res: Response) => {
    try {
      const userId = zObjectId.parse(req.session?.getUserId());
      const response = await bookingPageService.claimNewMeetings(userId);
      res.status(Status.OK).json(response);
    } catch (error) {
      respondBookingError(res, error);
    }
  };

  getPublicPage = async (req: Request, res: Response) => {
    try {
      const response = await publicBookingService.getPublicPage(
        req.params["slug"] ?? "",
      );
      res.status(Status.OK).json(response);
    } catch (error) {
      respondBookingError(res, error);
    }
  };

  getPublicSlots = async (req: Request, res: Response) => {
    try {
      const response = await publicBookingService.getSlots(
        req.params["slug"] ?? "",
        {
          start: req.query["start"],
          end: req.query["end"],
          timeZone: req.query["timeZone"],
        },
      );
      res.status(Status.OK).json(response);
    } catch (error) {
      respondBookingError(res, error);
    }
  };

  createReservation = async (req: Request, res: Response) => {
    try {
      const response = await publicBookingService.createReservation(
        req.params["slug"] ?? "",
        req.body,
      );
      res.status(Status.OK).json(response);
    } catch (error) {
      respondBookingError(res, error, "create");
    }
  };

  getPublicReservation = async (req: Request, res: Response) => {
    try {
      const parsedId = zObjectId.safeParse(req.params["id"]);
      if (!parsedId.success) {
        respondBookingError(
          res,
          bookingError("RESERVATION_NOT_FOUND", "Reservation not found"),
        );
        return;
      }
      const response = await publicBookingService.getPublicReservation(
        parsedId.data,
      );
      res.status(Status.OK).json(response);
    } catch (error) {
      respondBookingError(res, error);
    }
  };

  patchPublicReservation = async (req: Request, res: Response) => {
    try {
      const parsedId = zObjectId.safeParse(req.params["id"]);
      if (!parsedId.success) {
        respondBookingError(
          res,
          bookingError("RESERVATION_NOT_FOUND", "Reservation not found"),
        );
        return;
      }
      const response = await publicBookingService.patchPublicReservation(
        parsedId.data,
        req.body,
      );
      res.status(Status.OK).json(response);
    } catch (error) {
      respondBookingError(res, error, "edit");
    }
  };

  cancelReservation = async (req: Request, res: Response) => {
    try {
      const reservationId = zObjectId.parse(req.params["id"]);
      await publicBookingService.cancelReservation(reservationId, req.body);
      res.status(Status.OK).json({ ok: true });
    } catch (error) {
      respondBookingError(res, error, "cancel");
    }
  };

  getReservationSlots = async (req: Request, res: Response) => {
    try {
      const parsedId = zObjectId.safeParse(req.params["id"]);
      if (!parsedId.success) {
        respondBookingError(
          res,
          bookingError("RESERVATION_NOT_FOUND", "Reservation not found"),
        );
        return;
      }
      const response = await publicBookingService.getReservationSlots(
        parsedId.data,
        {
          token: req.query["token"],
          start: req.query["start"],
          end: req.query["end"],
          timeZone: req.query["timeZone"],
        },
      );
      res.status(Status.OK).json(response);
    } catch (error) {
      respondBookingError(res, error);
    }
  };

  rescheduleReservation = async (req: Request, res: Response) => {
    try {
      const parsedId = zObjectId.safeParse(req.params["id"]);
      if (!parsedId.success) {
        respondBookingError(
          res,
          bookingError("RESERVATION_NOT_FOUND", "Reservation not found"),
        );
        return;
      }
      const response = await publicBookingService.rescheduleReservation(
        parsedId.data,
        req.body,
      );
      res.status(Status.OK).json(response);
    } catch (error) {
      respondBookingError(res, error, "reschedule");
    }
  };
}

export default new BookingController();
