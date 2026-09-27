import {
  dismissContactsNudge,
  markContactsNudgeShown,
  resetContactsNudgeSessionForTests,
  shouldShowContactsNudge,
} from "./contact-nudge.gate";
import { beforeEach, describe, expect, it } from "bun:test";

// Product decision 1: the enable-contacts nudge is OCCASIONAL and
// non-nagging. These tests ARE the frequency rule — at most one showing per
// session, and a dismissal silences it forever — so loosening them is a
// product regression, not a cleanup.

describe("contact-nudge gate (nudge frequency rules)", () => {
  beforeEach(() => {
    localStorage.clear();
    resetContactsNudgeSessionForTests();
  });

  it("shows at most once per session", () => {
    expect(shouldShowContactsNudge()).toBe(true);

    markContactsNudgeShown();

    // Every later menu open in the same session stays nudge-free.
    expect(shouldShowContactsNudge()).toBe(false);
    expect(shouldShowContactsNudge()).toBe(false);
  });

  it("shows again in a NEW session when it was never dismissed", () => {
    markContactsNudgeShown();
    expect(shouldShowContactsNudge()).toBe(false);

    // A new session (fresh module state, same storage): occasional, not gone.
    resetContactsNudgeSessionForTests();
    expect(shouldShowContactsNudge()).toBe(true);
  });

  it("persists an explicit dismissal across sessions via localStorage", () => {
    dismissContactsNudge();
    expect(shouldShowContactsNudge()).toBe(false);
    expect(localStorage.getItem("compass.contactsNudge.dismissed")).toBe(
      "true",
    );

    // Simulate the next app session: the dismissal survives.
    resetContactsNudgeSessionForTests();
    expect(shouldShowContactsNudge()).toBe(false);
  });

  it("still bounds showing to once per session when storage throws", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("storage unavailable");
    };
    try {
      expect(shouldShowContactsNudge()).toBe(true);
      markContactsNudgeShown();
      expect(shouldShowContactsNudge()).toBe(false);
      // dismiss must not throw even when setItem fails too.
      const originalSet = Storage.prototype.setItem;
      Storage.prototype.setItem = () => {
        throw new Error("storage unavailable");
      };
      try {
        expect(() => dismissContactsNudge()).not.toThrow();
      } finally {
        Storage.prototype.setItem = originalSet;
      }
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
