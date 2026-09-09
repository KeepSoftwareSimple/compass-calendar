import { type Request, type Response } from "express";
import { type SessionRequest } from "supertokens-node/framework/express";
import { Status } from "@core/errors/status.codes";
import { zObjectId } from "@core/types/type.utils";
import {
  bookingError,
  toBookingErrorResponse,
} from "@backend/booking/booking.error";
import bookingPageService from "@backend/booking/services/booking-page.service";
import publicBookingService from "@backend/booking/services/public-booking.service";

class BookingController {
  getPage = async (req: SessionRequest, res: Response) => {
    try {
      const userId = zObjectId.parse(req.session?.getUserId());
      const response = await bookingPageService.getAdminPage(userId);
      res.status(Status.OK).json(response);
    } catch (error) {
      const { status, body } = toBookingErrorResponse(error);
      res.status(status).json(body);
    }
  };

  getPageStatus = async (req: SessionRequest, res: Response) => {
    try {
      const userId = zObjectId.parse(req.session?.getUserId());
      const response = await publicBookingService.getHostPageStatus(userId);
      res.status(Status.OK).json(response);
    } catch (error) {
      const { status, body } = toBookingErrorResponse(error);
      res.status(status).json(body);
    }
  };

  putPage = async (req: SessionRequest, res: Response) => {
    try {
      const userId = zObjectId.parse(req.session?.getUserId());
      const response = await bookingPageService.putAdminPage(userId, req.body);
      res.status(Status.OK).json(response);
    } catch (error) {
      const { status, body } = toBookingErrorResponse(error);
      res.status(status).json(body);
    }
  };

  getPublicPage = async (req: Request, res: Response) => {
    try {
      const response = await publicBookingService.getPublicPage(
        req.params["slug"] ?? "",
      );
      res.status(Status.OK).json(response);
    } catch (error) {
      const { status, body } = toBookingErrorResponse(error);
      res.status(status).json(body);
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
      const { status, body } = toBookingErrorResponse(error);
      res.status(status).json(body);
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
      const { status, body } = toBookingErrorResponse(error);
      res.status(status).json(body);
    }
  };

  getPublicReservation = async (req: Request, res: Response) => {
    try {
      const parsedId = zObjectId.safeParse(req.params["id"]);
      if (!parsedId.success) {
        const { status, body } = toBookingErrorResponse(
          bookingError("RESERVATION_NOT_FOUND", "Reservation not found"),
        );
        res.status(status).json(body);
        return;
      }
      const response = await publicBookingService.getPublicReservation(
        parsedId.data,
      );
      res.status(Status.OK).json(response);
    } catch (error) {
      const { status, body } = toBookingErrorResponse(error);
      res.status(status).json(body);
    }
  };

  patchPublicReservation = async (req: Request, res: Response) => {
    try {
      const parsedId = zObjectId.safeParse(req.params["id"]);
      if (!parsedId.success) {
        const { status, body } = toBookingErrorResponse(
          bookingError("RESERVATION_NOT_FOUND", "Reservation not found"),
        );
        res.status(status).json(body);
        return;
      }
      const response = await publicBookingService.patchPublicReservation(
        parsedId.data,
        req.body,
      );
      res.status(Status.OK).json(response);
    } catch (error) {
      const { status, body } = toBookingErrorResponse(error);
      res.status(status).json(body);
    }
  };

  cancelReservation = async (req: Request, res: Response) => {
    try {
      const reservationId = zObjectId.parse(req.params["id"]);
      await publicBookingService.cancelReservation(reservationId, req.body);
      res.status(Status.OK).json({ ok: true });
    } catch (error) {
      const { status, body } = toBookingErrorResponse(error);
      res.status(status).json(body);
    }
  };

  getReservationSlots = async (req: Request, res: Response) => {
    try {
      const parsedId = zObjectId.safeParse(req.params["id"]);
      if (!parsedId.success) {
        const { status, body } = toBookingErrorResponse(
          bookingError("RESERVATION_NOT_FOUND", "Reservation not found"),
        );
        res.status(status).json(body);
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
      const { status, body } = toBookingErrorResponse(error);
      res.status(status).json(body);
    }
  };

  rescheduleReservation = async (req: Request, res: Response) => {
    try {
      const parsedId = zObjectId.safeParse(req.params["id"]);
      if (!parsedId.success) {
        const { status, body } = toBookingErrorResponse(
          bookingError("RESERVATION_NOT_FOUND", "Reservation not found"),
        );
        res.status(status).json(body);
        return;
      }
      const response = await publicBookingService.rescheduleReservation(
        parsedId.data,
        req.body,
      );
      res.status(Status.OK).json(response);
    } catch (error) {
      const { status, body } = toBookingErrorResponse(error);
      res.status(status).json(body);
    }
  };
}

export default new BookingController();
