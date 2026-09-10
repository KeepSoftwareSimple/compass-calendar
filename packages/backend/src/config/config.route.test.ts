import { NodeEnv } from "@core/constants/core.constants";
import { Status } from "@core/errors/status.codes";
import { normalizeDeployVersion } from "@core/util/deploy-version.util";
import { BaseDriver } from "@backend/__tests__/drivers/base.driver";
import { CONFIG } from "@backend/common/constants/config.constants";
import { describe, expect, it } from "bun:test";

describe("GET /api/config", () => {
  const baseDriver = new BaseDriver();
  const expectedVersion = () => normalizeDeployVersion(CONFIG.VERSION);

  it("returns Google availability from backend configuration", async () => {
    const originalClientId = CONFIG.GOOGLE_CLIENT_ID;
    const originalClientSecret = CONFIG.GOOGLE_CLIENT_SECRET;
    CONFIG.GOOGLE_CLIENT_ID = undefined;
    CONFIG.GOOGLE_CLIENT_SECRET = undefined;

    try {
      const response = await baseDriver
        .getServer()
        .get("/api/config")
        .expect(Status.OK);

      expect(response.body).toEqual({
        version: expectedVersion(),
        google: {
          isConfigured: false,
        },
        providers: {
          google: { signIn: false, connect: false },
          microsoft: { signIn: false, connect: false },
          apple: { signIn: false, connect: false },
        },
        sync: {
          cloudMutationMode: "enabled",
          execution: "passive",
        },
        billing: {
          isConfigured: false,
          enforcement: false,
          trialLengthDays: 7,
          publishableKey: null,
        },
      });
    } finally {
      CONFIG.GOOGLE_CLIENT_ID = originalClientId;
      CONFIG.GOOGLE_CLIENT_SECRET = originalClientSecret;
    }
  });

  it("reports Google unavailable when credentials are absent", async () => {
    const originalClientId = CONFIG.GOOGLE_CLIENT_ID;
    const originalClientSecret = CONFIG.GOOGLE_CLIENT_SECRET;
    CONFIG.GOOGLE_CLIENT_ID = undefined;
    CONFIG.GOOGLE_CLIENT_SECRET = undefined;

    try {
      const response = await baseDriver
        .getServer()
        .get("/api/config")
        .expect(Status.OK);

      expect(response.body).toEqual({
        version: expectedVersion(),
        google: {
          isConfigured: false,
        },
        providers: {
          google: { signIn: false, connect: false },
          microsoft: { signIn: false, connect: false },
          apple: { signIn: false, connect: false },
        },
        sync: {
          cloudMutationMode: "enabled",
          execution: "passive",
        },
        billing: {
          isConfigured: false,
          enforcement: false,
          trialLengthDays: 7,
          publishableKey: null,
        },
      });
    } finally {
      CONFIG.GOOGLE_CLIENT_ID = originalClientId;
      CONFIG.GOOGLE_CLIENT_SECRET = originalClientSecret;
    }
  });

  it("exposes the deployed version from runtime.version", async () => {
    const original = CONFIG.VERSION;
    CONFIG.VERSION = "v9.8.7";
    try {
      const response = await baseDriver
        .getServer()
        .get("/api/config")
        .expect(Status.OK);
      expect(response.body.version).toBe("9.8.7");
    } finally {
      CONFIG.VERSION = original;
    }
  });

  it("exposes Sync cutover posture", async () => {
    const response = await baseDriver
      .getServer()
      .get("/api/config")
      .expect(Status.OK);

    expect(response.body.sync).toEqual({
      cloudMutationMode: "enabled",
      execution: "passive",
    });
  });

  it("returns providers.google.connect true on a Google-only config", async () => {
    const originals = {
      googleId: CONFIG.GOOGLE_CLIENT_ID,
      googleSecret: CONFIG.GOOGLE_CLIENT_SECRET,
      microsoftId: CONFIG.MICROSOFT_CLIENT_ID,
      microsoftSecret: CONFIG.MICROSOFT_CLIENT_SECRET,
    };
    CONFIG.GOOGLE_CLIENT_ID = "client-id";
    CONFIG.GOOGLE_CLIENT_SECRET = "client-secret";
    CONFIG.MICROSOFT_CLIENT_ID = undefined;
    CONFIG.MICROSOFT_CLIENT_SECRET = undefined;

    try {
      const response = await baseDriver
        .getServer()
        .get("/api/config")
        .expect(Status.OK);

      expect(response.body.google.isConfigured).toBe(true);
      expect(response.body.providers.google.connect).toBe(true);
      expect(response.body.providers.microsoft.connect).toBe(false);
    } finally {
      CONFIG.GOOGLE_CLIENT_ID = originals.googleId;
      CONFIG.GOOGLE_CLIENT_SECRET = originals.googleSecret;
      CONFIG.MICROSOFT_CLIENT_ID = originals.microsoftId;
      CONFIG.MICROSOFT_CLIENT_SECRET = originals.microsoftSecret;
    }
  });

  it("hides Microsoft in production even when credentials are configured", async () => {
    const originals = {
      nodeEnv: CONFIG.NODE_ENV,
      microsoftId: CONFIG.MICROSOFT_CLIENT_ID,
      microsoftSecret: CONFIG.MICROSOFT_CLIENT_SECRET,
    };
    CONFIG.NODE_ENV = NodeEnv.Production;
    CONFIG.MICROSOFT_CLIENT_ID = "ms-client-id";
    CONFIG.MICROSOFT_CLIENT_SECRET = "ms-client-secret";

    try {
      const response = await baseDriver
        .getServer()
        .get("/api/config")
        .expect(Status.OK);

      expect(response.body.providers.microsoft).toEqual({
        signIn: false,
        connect: false,
      });
    } finally {
      CONFIG.NODE_ENV = originals.nodeEnv;
      CONFIG.MICROSOFT_CLIENT_ID = originals.microsoftId;
      CONFIG.MICROSOFT_CLIENT_SECRET = originals.microsoftSecret;
    }
  });

  it("offers Microsoft in staging when credentials are configured", async () => {
    const originals = {
      nodeEnv: CONFIG.NODE_ENV,
      microsoftId: CONFIG.MICROSOFT_CLIENT_ID,
      microsoftSecret: CONFIG.MICROSOFT_CLIENT_SECRET,
    };
    CONFIG.NODE_ENV = NodeEnv.Staging;
    CONFIG.MICROSOFT_CLIENT_ID = "ms-client-id";
    CONFIG.MICROSOFT_CLIENT_SECRET = "ms-client-secret";

    try {
      const response = await baseDriver
        .getServer()
        .get("/api/config")
        .expect(Status.OK);

      expect(response.body.providers.microsoft).toEqual({
        signIn: true,
        connect: true,
      });
    } finally {
      CONFIG.NODE_ENV = originals.nodeEnv;
      CONFIG.MICROSOFT_CLIENT_ID = originals.microsoftId;
      CONFIG.MICROSOFT_CLIENT_SECRET = originals.microsoftSecret;
    }
  });
});
