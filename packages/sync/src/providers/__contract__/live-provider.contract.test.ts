import { describeProviderContract } from "@sync/providers/__contract__/adapter-contract";
import {
  appleLiveFactory,
  hasAppleLiveCredentials,
  smokeAppleAppPassword,
} from "@sync/providers/__contract__/apple-contract.factory";
import {
  googleLiveFactory,
  hasGoogleLiveCredentials,
} from "@sync/providers/__contract__/google-contract.factory";
import {
  hasMicrosoftLiveCredentials,
  microsoftLiveFactory,
} from "@sync/providers/__contract__/microsoft-contract.factory";
import { describe, it } from "bun:test";

const liveKind = process.env["LIVE_PROVIDER"];
const calendarId = process.env["LIVE_CALENDAR_ID"];

const failLiveSetup = (kind: string, message: string): void => {
  describe(`live provider contract (${kind})`, () => {
    it(message, () => {
      throw new Error(message);
    });
  });
};

const skipLiveContract = (kind: string): void => {
  describe.skip(`live provider contract (${kind})`, () => {
    it("skipped: LIVE_CALENDAR_ID unset (nightly smoke discovers compass-smoke; set LIVE_CALENDAR_ID only for a fixture-seeded calendar replay)", () => {});
  });
};

if (!liveKind) {
  describe.skip("live provider contract", () => {
    it("set LIVE_PROVIDER=<kind> to run against the real API", () => {});
  });
} else if (liveKind === "google") {
  if (!process.env["SMOKE_GOOGLE_REFRESH_TOKEN"]) {
    failLiveSetup(
      "google",
      "SMOKE_GOOGLE_REFRESH_TOKEN is missing. Add it to the provider-smoke GitHub Environment secrets.",
    );
  } else if (!hasGoogleLiveCredentials()) {
    failLiveSetup(
      "google",
      "Google OAuth client id/secret missing (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in provider-smoke).",
    );
  } else if (!calendarId) {
    skipLiveContract("google");
  } else {
    describeProviderContract("google", googleLiveFactory, {
      calendarId,
      refreshToken: process.env["SMOKE_GOOGLE_REFRESH_TOKEN"],
      skipAuthExchange: true,
      skipAuthRevoked: true,
      skipWatch: true,
    });
  }
} else if (liveKind === "microsoft") {
  if (!process.env["SMOKE_MICROSOFT_REFRESH_TOKEN"]) {
    failLiveSetup(
      "microsoft",
      "SMOKE_MICROSOFT_REFRESH_TOKEN is missing. Add it to the provider-smoke GitHub Environment secrets.",
    );
  } else if (!hasMicrosoftLiveCredentials()) {
    failLiveSetup(
      "microsoft",
      "Microsoft OAuth client id/secret missing (MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in provider-smoke).",
    );
  } else if (!calendarId) {
    skipLiveContract("microsoft");
  } else {
    describeProviderContract("microsoft", microsoftLiveFactory, {
      calendarId,
      refreshToken: process.env["SMOKE_MICROSOFT_REFRESH_TOKEN"],
      skipAuthExchange: true,
      skipAuthRevoked: true,
      skipWatch: true,
      skipNotifications: true,
    });
  }
} else if (liveKind === "apple") {
  if (!hasAppleLiveCredentials()) {
    failLiveSetup(
      "apple",
      "SMOKE_APPLE_EMAIL or SMOKE_APPLE_APP_PASSWORD is missing. Add both to the provider-smoke GitHub Environment secrets.",
    );
  } else if (!calendarId) {
    skipLiveContract("apple");
  } else {
    describeProviderContract("apple", appleLiveFactory, {
      calendarId,
      accessToken: smokeAppleAppPassword(),
      skipAuthExchange: true,
      skipAuthRevoked: true,
      skipWatch: true,
      skipNotifications: true,
      skipNormalizerRoundTrip: true,
    });
  }
} else {
  failLiveSetup(
    liveKind,
    `Unknown LIVE_PROVIDER=${liveKind}. Expected google, microsoft, or apple.`,
  );
}
