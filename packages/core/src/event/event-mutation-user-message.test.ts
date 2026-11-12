import {
  googleProviderRejectedChangeMessage,
  providerCalendarProductName,
  providerSaveFailureMessage,
  syncUnavailablePendingMessage,
} from "@core/event/event-mutation-user-message";
import { describe, expect, it } from "bun:test";

describe("providerSaveFailureMessage", () => {
  it("names Google Calendar when the provider is google", () => {
    expect(providerSaveFailureMessage("google")).toBe(
      "Couldn't save to Google Calendar. Your change wasn't saved.",
    );
  });

  it("names Microsoft Calendar when the provider is microsoft", () => {
    expect(providerSaveFailureMessage("microsoft")).toBe(
      "Couldn't save to Microsoft Calendar. Your change wasn't saved.",
    );
  });

  it("falls back when the provider is unknown", () => {
    expect(providerSaveFailureMessage(undefined)).toBe(
      "Couldn't save that change, the calendar service had a problem. Your edit was not applied.",
    );
  });
});

describe("googleProviderRejectedChangeMessage", () => {
  it("tells the user to try again without birthday copy", () => {
    expect(googleProviderRejectedChangeMessage()).toBe(
      "Google rejected this change. Your edit wasn't saved. Try again.",
    );
  });
});

describe("providerCalendarProductName", () => {
  it("matches the web sidebar product names", () => {
    expect(providerCalendarProductName("google")).toBe("Google Calendar");
    expect(providerCalendarProductName("apple")).toBe("Apple Calendar");
  });
});

describe("syncUnavailablePendingMessage", () => {
  it("names Outlook and Microsoft for the microsoft provider", () => {
    expect(syncUnavailablePendingMessage("microsoft")).toBe(
      "Still saving to Outlook. Microsoft is responding slowly, so your change may appear shortly. Compass will keep trying.",
    );
  });

  it("names Google Calendar for google", () => {
    expect(syncUnavailablePendingMessage("google")).toContain(
      "Google Calendar",
    );
  });
});
