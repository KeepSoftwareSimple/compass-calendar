import { Status } from "@core/errors/status.codes";
import { CONFIG } from "@backend/common/constants/config.constants";
import * as syncServiceFactory from "@backend/common/services/sync-service/sync-service.factory";
import authController from "./auth.controller";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

describe("auth.controller", () => {
  describe("beginConnection", () => {
    const originalMutationMode = CONFIG.SYNC_CLOUD_MUTATION_MODE;
    const originalMicrosoftId = CONFIG.MICROSOFT_CLIENT_ID;
    const originalMicrosoftSecret = CONFIG.MICROSOFT_CLIENT_SECRET;

    afterEach(() => {
      CONFIG.SYNC_CLOUD_MUTATION_MODE = originalMutationMode;
      CONFIG.MICROSOFT_CLIENT_ID = originalMicrosoftId;
      CONFIG.MICROSOFT_CLIENT_SECRET = originalMicrosoftSecret;
      mock.restore();
    });

    it("rejects connect begin with typed MAINTENANCE during cutover", () => {
      CONFIG.SYNC_CLOUD_MUTATION_MODE = "maintenance";
      const status = mock().mockReturnThis();
      const json = mock();
      const promise = mock();

      authController.beginConnection(
        {
          body: { provider: "google" },
          session: { getUserId: () => "507f1f77bcf86cd799439011" },
        } as never,
        { status, json, promise } as never,
      );

      expect(promise).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(Status.SERVICE_UNAVAILABLE);
      expect(json).toHaveBeenCalledWith({
        code: "MAINTENANCE",
        message: "Cloud edits are paused for maintenance",
        retryable: true,
      });
    });

    it("rejects an unconfigured microsoft provider with 409 PROVIDER_NOT_CONFIGURED", async () => {
      CONFIG.MICROSOFT_CLIENT_ID = undefined;
      CONFIG.MICROSOFT_CLIENT_SECRET = undefined;
      const syncSpy = spyOn(syncServiceFactory, "getSyncServiceClient");
      const promise = mock();

      authController.beginConnection(
        {
          body: { provider: "microsoft" },
          session: { getUserId: () => "507f1f77bcf86cd799439011" },
        } as never,
        { promise } as never,
      );

      expect(syncSpy).not.toHaveBeenCalled();
      expect(promise).toHaveBeenCalledTimes(1);
      const rejection = promise.mock.calls[0]?.[0] as Promise<unknown>;
      await expect(rejection).rejects.toMatchObject({
        statusCode: Status.CONFLICT,
        code: "PROVIDER_NOT_CONFIGURED",
      });
    });
  });
});
