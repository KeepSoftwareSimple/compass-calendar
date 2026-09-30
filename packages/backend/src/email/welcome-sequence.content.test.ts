import { CONFIG } from "@backend/common/constants/config.constants";
import { WELCOME_SEQUENCE_CONTENT } from "@backend/email/welcome-sequence.content";
import { describe, expect, it } from "bun:test";

const appUrl = CONFIG.FRONTEND_URL.replace(/\/$/, "");

// Settings is a modal in calendar-web, not a route, so every CTA must use a
// URL the app actually handles: the root, `?settings=<page>`, or
// `?meetingSetup=1`. A `/settings/...` path renders the 404 view.
describe("welcome sequence content links", () => {
  it("sends the welcome email to the app root", () => {
    expect(WELCOME_SEQUENCE_CONTENT["welcome"]?.cta.href).toBe(appUrl);
  });

  it("sends the shortcuts email to the app root", () => {
    expect(WELCOME_SEQUENCE_CONTENT["shortcuts"]?.cta.href).toBe(appUrl);
  });

  it("opens Settings > Accounts from the connect-calendar email", () => {
    expect(WELCOME_SEQUENCE_CONTENT["connect-calendar"]?.cta.href).toBe(
      `${appUrl}/?settings=accounts`,
    );
  });

  it("opens meeting setup from the booking email", () => {
    expect(WELCOME_SEQUENCE_CONTENT["booking"]?.cta.href).toBe(
      `${appUrl}/?meetingSetup=1`,
    );
  });

  it("opens Settings > Billing from the trial-ending email", () => {
    expect(WELCOME_SEQUENCE_CONTENT["trial-ending"]?.cta.href).toBe(
      `${appUrl}/?settings=billing`,
    );
  });

  it("never links to a /settings path", () => {
    for (const entry of Object.values(WELCOME_SEQUENCE_CONTENT)) {
      expect(entry.cta.href).not.toContain("/settings");
    }
  });
});
