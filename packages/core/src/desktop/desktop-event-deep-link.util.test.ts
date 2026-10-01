import {
  buildDesktopEventDeepLink,
  parseDesktopEventDeepLink,
} from "@core/desktop/desktop-event-deep-link.util";
import { describe, expect, it } from "bun:test";

describe("parseDesktopEventDeepLink", () => {
  it("parses event ids from compass:// links", () => {
    expect(parseDesktopEventDeepLink("compass://event/abc123")).toEqual({
      eventId: "abc123",
    });
  });

  it("rejects auth and other schemes", () => {
    expect(
      parseDesktopEventDeepLink("compass://auth/google/callback?code=x"),
    ).toBeNull();
    expect(parseDesktopEventDeepLink("https://compasscalendar.com")).toBeNull();
  });
});

describe("buildDesktopEventDeepLink", () => {
  it("percent-encodes event ids", () => {
    expect(buildDesktopEventDeepLink("a/b")).toBe("compass://event/a%2Fb");
  });
});
