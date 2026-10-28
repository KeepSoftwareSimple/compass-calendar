import {
  connectCalendarPromptActions,
  resetConnectCalendarPromptStoreForTests,
} from "@web/components/ConnectCalendarPrompt/connect-calendar.store";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const capture = mock();

const actualPosthogBootstrap = {
  ...(await import("@web/auth/posthog/posthog.bootstrap")),
};
let isClientMocked = true;

mock.module("@web/auth/posthog/posthog.bootstrap", () => ({
  ...actualPosthogBootstrap,
  getPosthogClient: () =>
    isClientMocked ? { capture } : actualPosthogBootstrap.getPosthogClient(),
}));

afterAll(() => {
  isClientMocked = false;
});

describe("connect calendar prompt analytics", () => {
  beforeEach(() => {
    capture.mockClear();
    resetConnectCalendarPromptStoreForTests();
  });

  it("fires connect_prompt_shown with a non-empty step", () => {
    connectCalendarPromptActions.markShown();
    connectCalendarPromptActions.markShown();

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith("signup_step_viewed", {
      step: "connect_prompt_shown",
      step_name: "connect_prompt_shown",
    });
  });
});
