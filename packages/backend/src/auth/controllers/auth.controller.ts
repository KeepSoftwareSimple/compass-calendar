import { ObjectId } from "mongodb";
import { type SessionRequest } from "supertokens-node/framework/express";
import { Logger } from "@core/logger/winston.logger";
import { zObjectId } from "@core/types/object-id.schema";
import {
  type ConnectionBeginRequest,
  ConnectionBeginRequestSchema,
  toConnectionBeginRedirect,
} from "@core/types/sync/connection.contracts";
import {
  ConnectionIdSchema,
  type ProviderKind,
  ProviderKindSchema,
} from "@core/types/sync/identity.contracts";
import { resolveAppleFormPostRedirect } from "@backend/auth/services/apple/apple.auth.callback";
import compassAuthService from "@backend/auth/services/compass/compass.auth.service";
import { CONFIG } from "@backend/common/constants/config.constants";
import {
  isAppleConnectConfigured,
  isOAuthConnectConfigured,
} from "@backend/common/constants/config.util";
import {
  AuthError,
  authErrorCopy,
} from "@backend/common/errors/auth/auth.errors";
import { error } from "@backend/common/errors/handlers/error.handler";
import { assertCloudMutationsAllowed } from "@backend/common/services/sync-service/cloud-mutation-mode";
import { sealCredentialConnectRequest } from "@backend/common/services/sync-service/seal-credential-connect-request";
import { beginSyncConnection } from "@backend/common/services/sync-service/sync-connection-begin";
import { connectSyncCredential } from "@backend/common/services/sync-service/sync-credential-connect";
import { toSyncPrincipal } from "@backend/common/services/sync-service/sync-principal";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";
import { unwrapSyncResult } from "@backend/common/services/sync-service/unwrap-sync-result";
import {
  type ReqBody,
  type Res_Promise,
  type SReqBody,
} from "@backend/common/types/express.types";
import { toEventMutationError } from "@backend/event/event.error";

const logger = Logger("app:auth.controller");

const rejectIfMaintenance = (res: Res_Promise): boolean => {
  try {
    assertCloudMutationsAllowed();
    return false;
  } catch (err) {
    const { status, body } = toEventMutationError(err);
    res.status(status).json(body);
    return true;
  }
};

const assertProviderCanBegin = (provider: ProviderKind): void => {
  // Google begin stays on the existing sync path so an unconfigured Google
  // deploy keeps the pre-WP-07 error, not a new 409.
  if (provider === "google") return;
  if (isOAuthConnectConfigured(CONFIG, provider)) return;
  throw error(
    {
      ...AuthError.ProviderNotConfigured,
      description: authErrorCopy.notConfigured(provider),
    },
    "Connect Failed",
  );
};

const assertAppleCanConnect = (): void => {
  if (isAppleConnectConfigured(CONFIG)) return;
  throw error(
    {
      ...AuthError.ProviderNotConfigured,
      description: authErrorCopy.notConfigured("apple"),
    },
    "Connect Failed",
  );
};

class AuthController {
  createSession = async (
    req: ReqBody<{ cUserId: string }>,
    res: Res_Promise,
  ) => {
    const { cUserId } = req.body;

    if (!ObjectId.isValid(cUserId)) {
      res.promise({ error: "Invalid user ID" });
      return;
    }

    if (cUserId) {
      const sessionData =
        await compassAuthService.createSessionForUser(cUserId);

      res.promise({
        message: `User session created for ${cUserId}`,
        accessToken: sessionData.accessToken,
      });
    } else {
      res.promise({ error: "User doesn't exist" });
      return;
    }
  };

  getUserIdFromSession = (req: SessionRequest, res: Res_Promise) => {
    const userId = zObjectId.parse(req.session?.getUserId()).toString();

    res.promise({ userId });
  };

  beginConnection = (
    req: SReqBody<ConnectionBeginRequest>,
    res: Res_Promise,
    forcedProvider?: ProviderKind,
  ): void => {
    if (rejectIfMaintenance(res)) return;

    const request = ConnectionBeginRequestSchema.parse(req.body ?? {});
    const provider = forcedProvider ?? request.provider ?? "google";
    ProviderKindSchema.parse(provider);

    try {
      assertProviderCanBegin(provider);
    } catch (err) {
      res.promise(Promise.reject(err));
      return;
    }

    const client = getSyncServiceClient();
    const userId = zObjectId.parse(req.session?.getUserId()).toString();

    res.promise(
      beginSyncConnection(client, toSyncPrincipal(userId), {
        ...request,
        provider,
      }).then(toConnectionBeginRedirect),
    );
  };

  connectCredential = (req: SReqBody<unknown>, res: Res_Promise): void => {
    if (rejectIfMaintenance(res)) return;

    try {
      assertAppleCanConnect();
    } catch (err) {
      res.promise(Promise.reject(err));
      return;
    }

    const client = getSyncServiceClient();
    const userId = zObjectId.parse(req.session?.getUserId()).toString();
    const request = sealCredentialConnectRequest(
      userId,
      userId,
      req.body ?? {},
    );

    res.promise(
      connectSyncCredential(client, toSyncPrincipal(userId), request),
    );
  };

  disconnectConnection = (req: SessionRequest, res: Res_Promise): void => {
    if (rejectIfMaintenance(res)) return;

    const client = getSyncServiceClient();
    const userId = zObjectId.parse(req.session?.getUserId()).toString();
    const connectionId = ConnectionIdSchema.parse(req.params["connectionId"]);

    res.promise(
      client
        .disconnectConnection(toSyncPrincipal(userId), connectionId)
        .then((result) =>
          unwrapSyncResult(result, {
            logger,
            logMessage: "Sync disconnect failed",
            userMessage: "Failed to disconnect calendar account",
          }),
        )
        .then(() => ({ statusCode: 204 })),
    );
  };

  refreshConnection = (req: SessionRequest, res: Res_Promise): void => {
    if (rejectIfMaintenance(res)) return;

    const client = getSyncServiceClient();
    const userId = zObjectId.parse(req.session?.getUserId()).toString();

    res.promise(
      client.refreshConnection(toSyncPrincipal(userId)).then((result) =>
        unwrapSyncResult(result, {
          logger,
          logMessage: "Sync refresh failed",
          userMessage: "Failed to refresh calendar",
        }),
      ),
    );
  };

  appleSignInCallback = (
    req: ReqBody<Record<string, unknown>>,
    res: Res_Promise,
  ): void => {
    const result = resolveAppleFormPostRedirect(req.body ?? {});
    if ("status" in result) {
      res.status(result.status).json({ error: result.message });
      return;
    }
    res.redirect(302, result.location);
  };
}

export default new AuthController();
