import { type Request, type Response } from "express";
import { ZodError } from "zod/v4";
import { BaseError } from "@core/errors/errors.base";
import { Status } from "@core/errors/status.codes";
import { Logger } from "@core/logger/winston.logger";
import {
  type HiddenEventIdsResponse,
  HiddenEventIdsResponseSchema,
  SetEventHiddenInputSchema,
} from "@core/types/event-visibility.contracts";
import { zObjectId } from "@core/types/type.utils";
import { type UserMetadata, type UserProfile } from "@core/types/user.types";
import { toClientErrorPayload } from "@backend/common/errors/handlers/error.handler";
import { type SReqBody } from "@backend/common/types/express.types";
import hiddenEventService from "@backend/user/services/hidden-event.service";
import userService from "@backend/user/services/user.service";
import userMetadataService from "@backend/user/services/user-metadata.service";
import { type Summary_Delete } from "@backend/user/types/user.types";

const logger = Logger("app:user.controller");

const sendUserError = (res: Response, e: unknown) => {
  if (e instanceof ZodError) {
    logger.warn(
      `User input rejected: ${e.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
    res.status(Status.BAD_REQUEST).json({
      code: "INVALID_INPUT",
      message: "Invalid input",
    });
    return;
  }
  if (e instanceof BaseError) {
    res.status(e.statusCode).json(toClientErrorPayload(e));
    return;
  }
  const message = e instanceof Error ? e.message : "Unexpected error";
  res.status(Status.INTERNAL_SERVER).json({
    code: "INTERNAL_ERROR",
    message,
  });
};

class UserController {
  getProfile = async (
    req: Request<never, UserProfile, never, never>,
    res: Response,
  ) => {
    try {
      const user = zObjectId.parse(req.session?.getUserId());
      const profile = await userService.getProfile(user);

      res.status(Status.OK).json(profile);
    } catch (e) {
      sendUserError(res, e);
    }
  };
  deleteAccount = async (
    req: Request<never, Summary_Delete, never, never>,
    res: Response,
  ) => {
    try {
      // Session-derived only: a user may never delete anyone but themselves.
      const user = zObjectId.parse(req.session?.getUserId());
      const summary = await userService.deleteAccount(user.toString());

      // deleteAccount revokes the user's sessions server-side, but that
      // leaves this caller holding an access token that still passes
      // signature checks until it expires - long enough to boot back up as
      // the deleted user and start failing requests against data that no
      // longer exists. This clears their cookies on the way out. Safe after
      // the delete: revokeSession clears them without checking whether the
      // session row is still there.
      //
      // Best-effort on purpose: the account is already gone, so failing here
      // would tell the user their deletion failed when it didn't.
      try {
        await req.session?.revokeSession();
      } catch (e) {
        logger.warn(
          `Deleted ${user.toString()} but could not clear their session cookies`,
          e,
        );
      }

      res.status(Status.OK).json(summary);
    } catch (e) {
      sendUserError(res, e);
    }
  };

  getMetadata = async (
    req: Request<never, UserMetadata, never, never>,
    res: Response,
  ) => {
    try {
      const user = zObjectId.parse(req.session?.getUserId());
      const metadata = await userMetadataService.fetchUserMetadata(
        user.toString(),
      );

      res.status(Status.OK).json(metadata);
    } catch (e) {
      sendUserError(res, e);
    }
  };

  updateMetadata = async (req: SReqBody<UserMetadata>, res: Response) => {
    try {
      const user = zObjectId.parse(req.session?.getUserId());

      const metadata = await userMetadataService.updateUserMetadata({
        userId: user.toString(),
        data: req.body,
      });

      res.status(Status.OK).json(metadata);
    } catch (e) {
      sendUserError(res, e);
    }
  };

  getHiddenEvents = async (
    req: Request<never, HiddenEventIdsResponse, never, never>,
    res: Response,
  ) => {
    try {
      const user = zObjectId.parse(req.session?.getUserId());
      const hiddenEventIds = await hiddenEventService.listHiddenEventIds(user);

      res
        .status(Status.OK)
        .json(HiddenEventIdsResponseSchema.parse({ hiddenEventIds }));
    } catch (e) {
      sendUserError(res, e);
    }
  };

  setEventHidden = async (
    req: SReqBody<{ eventId: string; hidden: boolean }>,
    res: Response,
  ) => {
    try {
      const user = zObjectId.parse(req.session?.getUserId());
      const input = SetEventHiddenInputSchema.parse(req.body);
      const hiddenEventIds = await hiddenEventService.setEventHidden(
        user,
        input,
      );

      res
        .status(Status.OK)
        .json(HiddenEventIdsResponseSchema.parse({ hiddenEventIds }));
    } catch (e) {
      sendUserError(res, e);
    }
  };
}

export default new UserController();
