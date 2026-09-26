import { isVirtualMeetingUrl } from "@core/util/conference/virtual-meeting-url";
import { describe, expect, it } from "bun:test";

describe("isVirtualMeetingUrl", () => {
  it("recognizes common video conference hosts", () => {
    expect(isVirtualMeetingUrl("https://meet.google.com/abc-defg-hij")).toBe(
      true,
    );
    expect(isVirtualMeetingUrl("https://us06web.zoom.us/j/123456789")).toBe(
      true,
    );
    expect(
      isVirtualMeetingUrl(
        "https://teams.microsoft.com/l/meetup-join/19%3ameeting",
      ),
    ).toBe(true);
    expect(isVirtualMeetingUrl("https://company.webex.com/meet/host")).toBe(
      true,
    );
  });

  it("rejects generic document and workspace links", () => {
    expect(
      isVirtualMeetingUrl(
        "https://app.notion.com/p/alpaca-ty/Forever-Today-4e2d",
      ),
    ).toBe(false);
    expect(isVirtualMeetingUrl("https://docs.google.com/document/d/abc")).toBe(
      false,
    );
    expect(isVirtualMeetingUrl("https://example.com/meet")).toBe(false);
  });
});
