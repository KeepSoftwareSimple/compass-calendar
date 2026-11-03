import { type DirectTrackProductEvent } from "@web/auth/posthog/track";
import { describe, it } from "bun:test";

type ExpectNever<T extends never> = T;

describe("signup_step_viewed track guard", () => {
  it("excludes signup_step_viewed from DirectTrackProductEvent", () => {
    type _BlockedSignupStepViewed = ExpectNever<
      Extract<DirectTrackProductEvent, "signup_step_viewed">
    >;
  });
});
