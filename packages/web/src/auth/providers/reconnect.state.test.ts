import {
  clearAccountReconnectRequired,
  clearAllGoogleReconnectRequired,
  getGoogleReconnectRequiredAccountEmails,
  getReconnectRequiredAccountKeys,
  hasAnyReconnectRequired,
  hasGoogleReconnectRequired,
  hasProviderReconnectRequired,
  isAccountReconnectRequired,
  isConnectionReconnectRequired,
  markAccountReconnectRequired,
  reconnectAccountKey,
  resetGoogleReconnectRequiredForTests,
  syncReconnectRequiredFromConnections,
} from "./reconnect.state";
import { afterEach, describe, expect, it } from "bun:test";

afterEach(() => {
  resetGoogleReconnectRequiredForTests();
});

describe("google.reconnect.state", () => {
  it("marks and queries reconnect-required by connection id and email+provider", () => {
    markAccountReconnectRequired({
      connectionId: "conn-1",
      accountEmail: "Lance@Example.com",
      provider: "google",
    });

    expect(isConnectionReconnectRequired("conn-1")).toBe(true);
    expect(isAccountReconnectRequired("lance@example.com", "google")).toBe(
      true,
    );
    expect(isAccountReconnectRequired("lance@example.com", "microsoft")).toBe(
      false,
    );
    expect(isAccountReconnectRequired("lance@example.com")).toBe(false);
    expect(hasGoogleReconnectRequired()).toBe(true);
    expect([...getGoogleReconnectRequiredAccountEmails()]).toEqual([
      "lance@example.com",
    ]);
    expect([...getReconnectRequiredAccountKeys()]).toEqual([
      reconnectAccountKey("google", "lance@example.com"),
    ]);
  });

  it("does not treat a Microsoft reconnect as a Google reconnect for the same email", () => {
    markAccountReconnectRequired({
      connectionId: "ms-1",
      accountEmail: "lance@example.com",
      provider: "microsoft",
    });

    expect(isAccountReconnectRequired("lance@example.com", "microsoft")).toBe(
      true,
    );
    expect(isAccountReconnectRequired("lance@example.com", "google")).toBe(
      false,
    );
    expect(hasGoogleReconnectRequired()).toBe(false);
    expect(hasProviderReconnectRequired("microsoft")).toBe(true);
    expect(hasAnyReconnectRequired()).toBe(true);
  });

  it("adds RECONNECT_REQUIRED rows and drops overrides only when the account disappears", () => {
    markAccountReconnectRequired({
      connectionId: "stale",
      accountEmail: "gone@example.com",
      provider: "google",
    });
    markAccountReconnectRequired({
      connectionId: "lagging",
      accountEmail: "lag@example.com",
      provider: "google",
    });

    syncReconnectRequiredFromConnections([
      {
        id: "healthy",
        accountEmail: "ok@example.com",
        connectionState: "HEALTHY",
        provider: "google",
      },
      {
        id: "lagging",
        accountEmail: "lag@example.com",
        // Still healthy in metadata after a 410 — must not clear the override.
        connectionState: "HEALTHY",
        provider: "google",
      },
      {
        id: "broken",
        accountEmail: "bad@example.com",
        connectionState: "RECONNECT_REQUIRED",
        provider: "google",
      },
    ]);

    expect(isConnectionReconnectRequired("stale")).toBe(false);
    expect(isAccountReconnectRequired("gone@example.com", "google")).toBe(
      false,
    );
    expect(isConnectionReconnectRequired("lagging")).toBe(true);
    expect(isAccountReconnectRequired("lag@example.com", "google")).toBe(true);
    expect(isConnectionReconnectRequired("broken")).toBe(true);
    expect(isAccountReconnectRequired("bad@example.com", "google")).toBe(true);
    expect(isConnectionReconnectRequired("healthy")).toBe(false);
  });

  it("clears one provider's override without clearing a sibling on the same email", () => {
    markAccountReconnectRequired({
      connectionId: "google-1",
      accountEmail: "shared@example.com",
      provider: "google",
    });
    markAccountReconnectRequired({
      connectionId: "ms-1",
      accountEmail: "shared@example.com",
      provider: "microsoft",
    });

    clearAccountReconnectRequired({
      connectionId: "google-1",
      accountEmail: "shared@example.com",
      provider: "google",
    });

    expect(isConnectionReconnectRequired("google-1")).toBe(false);
    expect(isAccountReconnectRequired("shared@example.com", "google")).toBe(
      false,
    );
    expect(isConnectionReconnectRequired("ms-1")).toBe(true);
    expect(isAccountReconnectRequired("shared@example.com", "microsoft")).toBe(
      true,
    );
  });

  it("clearAccountReconnectRequired and clearAll remove overrides", () => {
    markAccountReconnectRequired({
      connectionId: "conn-1",
      accountEmail: "a@example.com",
      provider: "google",
    });
    clearAccountReconnectRequired({
      connectionId: "conn-1",
      accountEmail: "a@example.com",
      provider: "google",
    });
    expect(hasGoogleReconnectRequired()).toBe(false);

    markAccountReconnectRequired({
      connectionId: "conn-2",
      accountEmail: "b@example.com",
      provider: "google",
    });
    clearAllGoogleReconnectRequired();
    expect(hasGoogleReconnectRequired()).toBe(false);
  });
});
