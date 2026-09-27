import {
  clearProviderAuthorizationIntent,
  readProviderAuthorizationIntent,
  writeProviderAuthorizationIntent,
} from "./provider-authorization.storage";
import { afterEach, describe, expect, it } from "bun:test";

describe("provider-authorization.storage", () => {
  afterEach(() => sessionStorage.clear());

  it("stores and reads an intent by OAuth state", () => {
    writeProviderAuthorizationIntent("google", "state-1", {
      intent: "signIn",
      returnPath: "/week?panel=tasks#top",
      createdAt: Date.now(),
    });

    expect(readProviderAuthorizationIntent("google", "state-1")).toMatchObject({
      intent: "signIn",
      returnPath: "/week?panel=tasks#top",
    });
  });

  it("keys intents per provider so one provider cannot read another's", () => {
    writeProviderAuthorizationIntent("microsoft", "shared-state", {
      intent: "signIn",
      returnPath: "/day",
      createdAt: Date.now(),
    });

    expect(
      readProviderAuthorizationIntent("microsoft", "shared-state"),
    ).toMatchObject({ returnPath: "/day" });
    expect(
      readProviderAuthorizationIntent("google", "shared-state"),
    ).toBeNull();
  });

  it("removes invalid or expired stored intents", () => {
    writeProviderAuthorizationIntent("google", "state-1", {
      intent: "signIn",
      returnPath: "/week",
      createdAt: Date.now() - 11 * 60 * 1000,
    });

    expect(readProviderAuthorizationIntent("google", "state-1")).toBeNull();
  });

  it("removes stored intents with invalid JSON", () => {
    sessionStorage.setItem("compass.googleAuthorizationIntent.state-1", "{");

    expect(readProviderAuthorizationIntent("google", "state-1")).toBeNull();
  });

  it("removes stored intents with unsafe return paths", () => {
    sessionStorage.setItem(
      "compass.googleAuthorizationIntent.state-1",
      JSON.stringify({
        intent: "signIn",
        returnPath: "//evil.example",
        createdAt: Date.now(),
      }),
    );

    expect(readProviderAuthorizationIntent("google", "state-1")).toBeNull();
  });

  it("clears a consumed intent", () => {
    writeProviderAuthorizationIntent("google", "state-1", {
      intent: "signIn",
      returnPath: "/day",
      createdAt: Date.now(),
    });

    clearProviderAuthorizationIntent("google", "state-1");

    expect(readProviderAuthorizationIntent("google", "state-1")).toBeNull();
  });
});
