import { CONFIG } from "@backend/common/constants/config.constants";
import { WELCOME_SEQUENCE_CONTENT } from "@backend/email/welcome-sequence.content";
import { describe, expect, it } from "bun:test";

const appUrl = CONFIG.FRONTEND_URL.replace(/\/$/, "");

// Settings is a modal in calendar-web, not a route, so every CTA must use a
// URL the app actually handles: the root or `?settings=<page>`. A `/settings/...` path renders the 404 view.
describe("welcome sequence content links", () => {
  it("sends every tip email to the app root", () => {
    for (const key of [
      "cmd-k",
      "shortcut-list",
      "jump-around",
      "adjusting-times",
      "roundup",
    ] as const) {
      expect(WELCOME_SEQUENCE_CONTENT[key].cta.href).toBe(appUrl);
    }
  });

  it("numbers the six onboarding emails and introduces review controls in the final email", () => {
    const keys = [
      "cmd-k",
      "shortcut-list",
      "jump-around",
      "adjusting-times",
      "roundup",
      "weekly-review",
    ] as const;
    keys.forEach((key, index) =>
      expect(WELCOME_SEQUENCE_CONTENT[key].subject).toContain(`(${index}/5)`),
    );
    const review = WELCOME_SEQUENCE_CONTENT["weekly-review"];
    expect(review.cta.href).toBe(`${appUrl}/?settings=notifications`);
    expect(review.paragraphs.join(" ")).toContain("Sunday at 10:30 a.m.");
    expect(review.paragraphs.join(" ")).toContain("Settings > Notifications");
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
