import { parseCompassConfigText } from "./compass.config";
import { describe, expect, it } from "bun:test";

const validYaml = `
runtime:
  version: latest
  nodeEnv: development
  logLevel: debug
  timezone: Etc/UTC
web:
  port: 9080
  url: http://localhost:9080
backend:
  port: 3000
  apiUrl: http://localhost:3000/api
  originsAllowed:
    - http://localhost:3000
    - http://localhost:9080
  compassToken: sync-token
mongo:
  username: compass
  password: mongo-password
  replicaSetKey: replica-set-key
  uri: mongodb://localhost:27017/compass
supertokens:
  uri: http://localhost:3567
  key: supertokens-key
  postgres:
    user: supertokens
    password: postgres-password
    database: supertokens
`;

describe("compass config", () => {
  it("parses grouped YAML into a typed CompassConfig object", () => {
    const config = parseCompassConfigText(validYaml, "compass.yaml");

    expect(config.runtime.nodeEnv).toBe("development");
    expect(config.runtime.timezone).toBe("Etc/UTC");
    expect(config.runtime.logLevel).toBe("debug");
    expect(config.backend.apiUrl).toBe("http://localhost:3000/api");
    expect(config.backend.compassToken).toBe("sync-token");
    expect(config.backend.originsAllowed).toEqual([
      "http://localhost:3000",
      "http://localhost:9080",
    ]);
    expect(config.backend.port).toBe(3000);
    expect(config.web.port).toBe(9080);
    expect(config.web.url).toBe("http://localhost:9080");
    expect(config.mongo.uri).toBe("mongodb://localhost:27017/compass");
    expect(config.mongo.username).toBe("compass");
    expect(config.supertokens.uri).toBe("http://localhost:3567");
    expect(config.supertokens.key).toBe("supertokens-key");
    expect(config.supertokens.postgres?.user).toBe("supertokens");
    expect(config.runtime.version).toBe("latest");
  });

  it("omits optional Google and email config when keys are absent", () => {
    const config = parseCompassConfigText(validYaml, "compass.yaml");

    expect(config.google?.clientId).toBeUndefined();
    expect(config.google?.clientSecret).toBeUndefined();
    expect(config.email).toBeUndefined();
    expect(config.posthog).toBeUndefined();
    expect(config.sync).toBeUndefined();
  });

  it("parses the optional sync section when provided", () => {
    const config = parseCompassConfigText(
      `${validYaml}
sync:
  port: 3010
  mongoUri: mongodb://localhost:27017/compass_sync
  internalAuthToken: internal-token
  callbackBaseUrl: http://localhost:3010
  execution: passive
`,
      "compass.yaml",
    );

    expect(config.sync?.mongoUri).toBe(
      "mongodb://localhost:27017/compass_sync",
    );
    expect(config.sync?.internalAuthToken).toBe("internal-token");
    expect(config.sync?.callbackBaseUrl).toBe("http://localhost:3010");
    expect(config.sync?.execution).toBe("passive");
  });

  it("accepts optional sections that are empty because they only contain comments", () => {
    const config = parseCompassConfigText(
      `${validYaml}
email:
posthog:
`,
      "compass.yaml",
    );

    expect(config.email).toBeNull();
    expect(config.posthog?.key).toBeUndefined();
  });

  it("parses google section when provided", () => {
    const config = parseCompassConfigText(
      `${validYaml}
google:
  clientId: my-client-id
  clientSecret: my-client-secret
`,
      "compass.yaml",
    );

    expect(config.google?.clientId).toBe("my-client-id");
    expect(config.google?.clientSecret).toBe("my-client-secret");
  });

  it("parses a file that only has google among the provider blocks", () => {
    const config = parseCompassConfigText(
      `${validYaml}
google:
  clientId: my-client-id
  clientSecret: my-client-secret
`,
      "compass.yaml",
    );

    expect(config.microsoft).toBeUndefined();
    expect(config.apple).toBeUndefined();
    expect(config.sync?.credentialEncryptionKey).toBeUndefined();
  });

  it("rejects microsoft when only one of the two keys is set", () => {
    expect(() =>
      parseCompassConfigText(
        `${validYaml}
microsoft:
  clientId: ms-client-id
`,
        "compass.yaml",
      ),
    ).toThrow("Microsoft configuration requires both client ID and secret");

    expect(() =>
      parseCompassConfigText(
        `${validYaml}
microsoft:
  clientSecret: ms-client-secret
`,
        "compass.yaml",
      ),
    ).toThrow("Microsoft configuration requires both client ID and secret");
  });

  it("parses microsoft when both keys are set", () => {
    const config = parseCompassConfigText(
      `${validYaml}
microsoft:
  clientId: ms-client-id
  clientSecret: ms-client-secret
`,
      "compass.yaml",
    );

    expect(config.microsoft?.clientId).toBe("ms-client-id");
    expect(config.microsoft?.clientSecret).toBe("ms-client-secret");
  });

  it("rejects apple.signIn when only three of the four keys are set", () => {
    expect(() =>
      parseCompassConfigText(
        `${validYaml}
apple:
  signIn:
    servicesId: com.example.siwa
    teamId: TEAMID12
    keyId: KEYID123
`,
        "compass.yaml",
      ),
    ).toThrow(
      "Apple sign-in configuration requires servicesId, teamId, keyId, and privateKey together",
    );
  });

  it("parses apple.signIn when all four keys are set", () => {
    const config = parseCompassConfigText(
      `${validYaml}
apple:
  signIn:
    servicesId: com.example.siwa
    teamId: TEAMID12
    keyId: KEYID123
    privateKey: dummy-private-key
`,
      "compass.yaml",
    );

    expect(config.apple?.signIn?.servicesId).toBe("com.example.siwa");
    expect(config.apple?.signIn?.teamId).toBe("TEAMID12");
    expect(config.apple?.signIn?.keyId).toBe("KEYID123");
    expect(config.apple?.signIn?.privateKey).toBe("dummy-private-key");
  });

  it("rejects a credentialEncryptionKey shorter than 32 bytes", () => {
    const shortKey = Buffer.alloc(16, 1).toString("base64");
    expect(() =>
      parseCompassConfigText(
        `${validYaml}
sync:
  port: 3010
  mongoUri: mongodb://localhost:27017/compass_sync
  internalAuthToken: internal-token
  callbackBaseUrl: http://localhost:3010
  credentialEncryptionKey: ${shortKey}
`,
        "compass.yaml",
      ),
    ).toThrow("sync.credentialEncryptionKey must be 32 bytes of base64");
  });

  it("parses a 32-byte credentialEncryptionKey", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const config = parseCompassConfigText(
      `${validYaml}
sync:
  port: 3010
  mongoUri: mongodb://localhost:27017/compass_sync
  internalAuthToken: internal-token
  callbackBaseUrl: http://localhost:3010
  credentialEncryptionKey: ${key}
`,
      "compass.yaml",
    );

    expect(config.sync?.credentialEncryptionKey).toBe(key);
  });

  it("throws a clear error for invalid YAML", () => {
    expect(() =>
      parseCompassConfigText("runtime:\n  nodeEnv: [", "broken.yaml"),
    ).toThrow("Could not parse Compass config file broken.yaml");
  });

  it("throws a clear error for missing required fields", () => {
    expect(() =>
      parseCompassConfigText(
        "runtime:\n  nodeEnv: development\n  timezone: Etc/UTC\n",
        "incomplete.yaml",
      ),
    ).toThrow("Invalid Compass config file incomplete.yaml");
  });
});

describe("compass config — placeholder detection", () => {
  it("throws with the field path when a single value contains REPLACE_WITH_", () => {
    const yaml = validYaml.replace(
      "supertokens-key",
      "REPLACE_WITH_SUPERTOKENS_KEY",
    );
    expect(() => parseCompassConfigText(yaml, "compass.yaml")).toThrow(
      "supertokens.key",
    );
  });

  it("collects all placeholder fields into a single error", () => {
    const yaml = validYaml
      .replace("sync-token", "REPLACE_WITH_COMPASS_TOKEN")
      .replace("supertokens-key", "REPLACE_WITH_SUPERTOKENS_KEY");
    expect(() => parseCompassConfigText(yaml, "compass.yaml")).toThrow(
      /backend\.compassToken[\s\S]*supertokens\.key/,
    );
  });

  it("detects a placeholder embedded inside a URI string", () => {
    const yaml = validYaml.replace(
      "mongodb://localhost:27017/compass",
      "mongodb://compass:REPLACE_WITH_MONGO_PASSWORD@mongo:27017/compass",
    );
    expect(() => parseCompassConfigText(yaml, "compass.yaml")).toThrow(
      "mongo.uri",
    );
  });

  it("detects a placeholder inside an originsAllowed array entry", () => {
    const yaml = validYaml.replace(
      "- http://localhost:3000",
      "- REPLACE_WITH_YOUR_WEB_URL",
    );
    expect(() => parseCompassConfigText(yaml, "compass.yaml")).toThrow(
      "backend.originsAllowed[0]",
    );
  });

  it("includes the file path in the placeholder error message", () => {
    const yaml = validYaml.replace(
      "supertokens-key",
      "REPLACE_WITH_SUPERTOKENS_KEY",
    );
    expect(() => parseCompassConfigText(yaml, "my-compass.yaml")).toThrow(
      "my-compass.yaml",
    );
  });
});

describe("compass config — email", () => {
  const unsubscribeSecret = Buffer.alloc(32, 3).toString("base64");

  const fullResendBlock = `
email:
  provider: resend
  apiKey: re_test_key
  from: Compass <hello@mail.compasscalendar.com>
  webhookSecret: whsec_test_webhook
  unsubscribeSecret: ${unsubscribeSecret}
  scheduleProfile: real
  allowlist:
    - qa@example.com
`;

  it("parses a full email block", () => {
    const config = parseCompassConfigText(
      `${validYaml}${fullResendBlock}`,
      "compass.yaml",
    );

    expect(config.email?.provider).toBe("resend");
    expect(config.email?.apiKey).toBe("re_test_key");
    expect(config.email?.from).toBe("Compass <hello@mail.compasscalendar.com>");
    expect(config.email?.webhookSecret).toBe("whsec_test_webhook");
    expect(config.email?.unsubscribeSecret).toBe(unsubscribeSecret);
    expect(config.email?.scheduleProfile).toBe("real");
    expect(config.email?.allowlist).toEqual(["qa@example.com"]);
  });

  it("leaves email unconfigured when the block is omitted", () => {
    const config = parseCompassConfigText(validYaml, "compass.yaml");
    expect(config.email).toBeUndefined();
  });

  it("rejects resend when any one of the four required values is missing", () => {
    const base = {
      provider: "resend",
      apiKey: "re_test_key",
      from: "Compass <hello@mail.compasscalendar.com>",
      webhookSecret: "whsec_test_webhook",
      unsubscribeSecret,
    };
    const missingFields = [
      "apiKey",
      "from",
      "webhookSecret",
      "unsubscribeSecret",
    ] as const;

    for (const field of missingFields) {
      const email = { ...base };
      delete email[field];
      const lines = Object.entries(email).map(
        ([key, value]) => `  ${key}: ${value}`,
      );
      const block = `email:\n${lines.join("\n")}\n`;
      expect(() =>
        parseCompassConfigText(`${validYaml}${block}`, "compass.yaml"),
      ).toThrow(`email.${field}`);
    }
  });

  it("rejects scheduleProfile fast when nodeEnv is production", () => {
    const productionYaml = validYaml.replace(
      "nodeEnv: development",
      "nodeEnv: production",
    );
    expect(() =>
      parseCompassConfigText(
        `${productionYaml}${fullResendBlock.replace(
          "scheduleProfile: real",
          "scheduleProfile: fast",
        )}`,
        "compass.yaml",
      ),
    ).toThrow("email.scheduleProfile");
  });
});
