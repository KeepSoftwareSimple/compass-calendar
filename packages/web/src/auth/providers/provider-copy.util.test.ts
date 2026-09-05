import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import {
  bookingConnectPromptCopy,
  CONNECT_CALENDAR_LABEL,
  calendarProductName,
  connectionProvider,
  defaultCalendarGroupLabel,
  emptyCalendarsCopy,
  openingProviderCopy,
  RECONNECT_BANNER_MESSAGE,
  RECONNECT_CALENDAR_LABEL,
  reconnectPointerHint,
  reconnectToastBody,
  reconnectToastTitle,
  relabelConnectCommand,
} from "./provider-copy.util";
import { describe, expect, it } from "bun:test";

describe("provider copy", () => {
  it("defaults a missing connection provider to google", () => {
    expect(connectionProvider(undefined)).toBe("google");
    expect(connectionProvider({ provider: "microsoft" })).toBe("microsoft");
  });

  it("keeps Google strings byte-identical", () => {
    expect(calendarProductName("google")).toBe("Google Calendar");
    expect(CONNECT_CALENDAR_LABEL.google).toBe("Connect Google Calendar");
    expect(RECONNECT_CALENDAR_LABEL.google).toBe("Reconnect Google Calendar");
    expect(RECONNECT_BANNER_MESSAGE.google).toBe(
      "Google Calendar needs reconnecting.",
    );
    expect(openingProviderCopy("google")).toBe("Opening Google…");
    expect(emptyCalendarsCopy(["google"])).toBe(
      "Connect Google to see your calendars.",
    );
    expect(defaultCalendarGroupLabel("ahab@pequod.com", "google")).toBe(
      "ahab@pequod.com (Google)",
    );
    expect(reconnectToastTitle("google", "lance@example.com")).toBe(
      "Google Calendar disconnected (lance@example.com)",
    );
    expect(reconnectToastTitle("google")).toBe("Google Calendar disconnected");
    expect(reconnectToastBody("google", "lance@example.com")).toBe(
      "Access for lance@example.com expired or was revoked. Your events are still safe in Google. Reconnect and Compass will re-import them.",
    );
    expect(reconnectToastBody("google")).toBe(
      "This happens when access expires or is revoked. Your events are still safe in Google. Reconnect and Compass will re-import them.",
    );
    expect(reconnectPointerHint("google")).toBe(
      "Press G to reconnect Google Calendar.",
    );
  });

  it("names Microsoft Calendar in reconnect copy", () => {
    expect(RECONNECT_BANNER_MESSAGE.microsoft).toBe(
      "Microsoft Calendar needs reconnecting.",
    );
    expect(reconnectToastTitle("microsoft", "ada@outlook.com")).toBe(
      "Microsoft Calendar disconnected (ada@outlook.com)",
    );
    expect(reconnectToastBody("microsoft", "ada@outlook.com")).toBe(
      "Access for ada@outlook.com expired or was revoked. Your events are still safe in Microsoft. Reconnect and Compass will re-import them.",
    );
    expect(RECONNECT_CALENDAR_LABEL.microsoft).toBe(
      "Reconnect Microsoft Calendar",
    );
    expect(CONNECT_CALENDAR_LABEL.microsoft).toBe("Connect Microsoft Calendar");
    expect(openingProviderCopy("microsoft")).toBe("Opening Microsoft…");
    expect(emptyCalendarsCopy(["microsoft"])).toBe(
      "Connect Microsoft to see your calendars.",
    );
    expect(defaultCalendarGroupLabel("ada@outlook.com", "microsoft")).toBe(
      "ada@outlook.com (Microsoft)",
    );
    expect(reconnectPointerHint("microsoft")).toBe(
      "Press G to reconnect Microsoft Calendar.",
    );
  });

  it("uses provider-neutral empty copy when more than one provider can connect", () => {
    expect(emptyCalendarsCopy(["google", "microsoft"])).toBe(
      "Connect a calendar to see your calendars.",
    );
  });

  it("keeps Google booking-connect copy byte-identical", () => {
    expect(bookingConnectPromptCopy(["google"])).toBe(
      "Connect a Google account to enable your booking page. Guests book through a public link and Compass creates events on your calendar.",
    );
    expect(bookingConnectPromptCopy(["microsoft"])).toBe(
      "Connect a Microsoft account to enable your booking page. Guests book through a public link and Compass creates events on your calendar.",
    );
    expect(bookingConnectPromptCopy(["google", "microsoft"])).toBe(
      "Connect a calendar account to enable your booking page. Guests book through a public link and Compass creates events on your calendar.",
    );
    expect(bookingConnectPromptCopy([])).toBe(
      "Connect a Google account to enable your booking page. Guests book through a public link and Compass creates events on your calendar.",
    );
  });

  it("relabels Google connect commands for another provider", () => {
    const connect = relabelConnectCommand(
      {
        label: "Connect Google Calendar",
        icon: ArrowsClockwiseIcon,
        onSelect: () => {},
      },
      "microsoft",
    );
    expect(connect?.label).toBe("Connect Microsoft Calendar");

    const reconnect = relabelConnectCommand(
      {
        label: "Reconnect Google Calendar",
        icon: ArrowsClockwiseIcon,
        onSelect: () => {},
      },
      "microsoft",
    );
    expect(reconnect?.label).toBe("Reconnect Microsoft Calendar");
  });
});
