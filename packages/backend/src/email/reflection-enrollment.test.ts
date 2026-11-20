import { ObjectId } from "mongodb";
import { type Schema_User } from "@core/types/user.types";
import { CONFIG } from "@backend/common/constants/config.constants";
import { isEmailSequenceStopped } from "@backend/email/email-unsubscribe";
import { reflectionEligible } from "@backend/email/reflection-enrollment";
import { afterEach, describe, expect, it } from "bun:test";

const original = { ...CONFIG };

const user = (emailPreferences: Schema_User["emailPreferences"]) =>
  ({
    _id: new ObjectId(),
    email: "person@example.com",
    reflectionPreferences: {
      enabled: true,
      timeZone: "America/Denver",
      excludedCalendarIds: [],
    },
    emailPreferences,
  }) as unknown as Parameters<typeof reflectionEligible>[0];

describe("reflectionEligible opt-out handling", () => {
  afterEach(() => {
    Object.assign(CONFIG, original);
  });

  const rollout = () =>
    Object.assign(CONFIG, {
      REFLECTION_ENABLED: true,
      EMAIL_PROVIDER: "log",
      REFLECTION_ROLLOUT_ENABLED: true,
      REFLECTION_ROLLOUT_START_DATE: undefined,
      REFLECTION_TRIAL_USER_ID: undefined,
      REFLECTION_TRIAL_EMAIL: undefined,
    });

  it("sends to an enrolled account with no opt-out on file", () => {
    rollout();
    expect(reflectionEligible(user(undefined), false)).toBe(true);
  });

  // A welcome-email unsubscribe carries no scope, so it stamps `unsubscribedAt`
  // rather than `reflectionDisabledAt`. Reviews must stop all the same.
  it.each([
    ["unsubscribedAt", { unsubscribedAt: new Date("2026-11-10T00:00:00Z") }],
    ["suppressedAt", { suppressedAt: new Date("2026-11-10T00:00:00Z") }],
  ])("agrees with the owning rule for %s", (_label, emailPreferences) => {
    rollout();
    const account = user(emailPreferences as Schema_User["emailPreferences"]);
    expect(isEmailSequenceStopped(account.emailPreferences)).toBe(true);
    expect(reflectionEligible(account, false)).toBe(false);
  });

  it("stops reviews for a reflection-scoped unsubscribe", () => {
    rollout();
    expect(
      reflectionEligible(
        user({
          reflectionDisabledAt: new Date("2026-11-10T00:00:00Z"),
        } as Schema_User["emailPreferences"]),
        false,
      ),
    ).toBe(false);
  });
});
