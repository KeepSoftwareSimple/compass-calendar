import { persistentBrowserStore } from "@web/common/storage/browser-key-value.store";
import {
  connectCalendarPromptActions,
  resetConnectCalendarPromptStoreForTests,
  selectConnectCalendarPromptSurfaceEligible,
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

describe("selectConnectCalendarPromptSurfaceEligible", () => {
  const base = {
    authenticated: true,
    metadataStatus: "loaded" as const,
    connectionCount: 0,
    isSnoozed: false,
    availableProviderCount: 2,
    storageAvailable: true,
    isAuthModalOpen: false,
    isSettingsOpen: false,
    isAboutOpen: false,
    isAppleFormOpen: false,
    isMissingPermissionsOpen: false,
  };

  it("waits until the first-event onboarding step finishes", () => {
    persistentBrowserStore.remove("compass.onboarding.first-event-done");
    expect(selectConnectCalendarPromptSurfaceEligible(base)).toBe(false);
    persistentBrowserStore.set(
      "compass.onboarding.first-event-done",
      "dismissed",
    );
    expect(selectConnectCalendarPromptSurfaceEligible(base)).toBe(true);
    persistentBrowserStore.remove("compass.onboarding.first-event-done");
  });
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
