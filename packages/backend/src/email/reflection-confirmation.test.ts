import { CONFIG } from "@backend/common/constants/config.constants";
import { reflectionConfirmationContent } from "@backend/email/reflection-confirmation";
import { afterEach, describe, expect, it } from "bun:test";

const original = { ...CONFIG };

describe("reflection confirmation email", () => {
  afterEach(() => {
    Object.assign(CONFIG, original);
  });

  it("names the sender address and the first Sunday send in the user's timezone", () => {
    CONFIG.EMAIL_FROM = "Compass <hello@mail.compasscalendar.com>";
    const content = reflectionConfirmationContent(
      "America/Denver",
      new Date("2026-11-24T18:00:00Z"),
    );
    const body = content.paragraphs.join(" ");
    expect(body).toContain("Sunday, November 29 at 10:30 AM (America/Denver)");
    expect(body).toContain("hello@mail.compasscalendar.com");
    expect(body).not.toContain("<");
  });

  it("falls back to generic sender copy when no from address is configured", () => {
    CONFIG.EMAIL_FROM = undefined;
    const body = reflectionConfirmationContent(
      "UTC",
      new Date("2026-11-24T18:00:00Z"),
    ).paragraphs.join(" ");
    expect(body).toContain("Add this sender to your contacts");
  });
});
