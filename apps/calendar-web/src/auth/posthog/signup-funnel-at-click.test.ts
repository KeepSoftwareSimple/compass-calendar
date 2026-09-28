import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const capture = mock();
const countLocalNonDemoEvents = mock(async () => 4);

const actualPosthogBootstrap = {
  ...(await import("@web/auth/posthog/posthog.bootstrap")),
};
let isClientMocked = true;

mock.module("@web/auth/posthog/posthog.bootstrap", () => ({
  ...actualPosthogBootstrap,
  getPosthogClient: () =>
    isClientMocked ? { capture } : actualPosthogBootstrap.getPosthogClient(),
}));

mock.module("@web/auth/posthog/anon-events-created.util", () => ({
  countLocalNonDemoEvents,
}));

afterAll(() => {
  isClientMocked = false;
});

const { trackSignupStartedAtClick } = await import(
  "@web/auth/posthog/signup-funnel"
);

describe("trackSignupStartedAtClick", () => {
  beforeEach(() => {
    capture.mockClear();
    countLocalNonDemoEvents.mockClear();
  });

  it("includes anon_events_created from local storage", async () => {
    await trackSignupStartedAtClick("anon_nudge");

    expect(countLocalNonDemoEvents).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenNthCalledWith(1, "signup_started", {
      source: "anon_nudge",
      anon_events_created: 4,
    });
  });
});
