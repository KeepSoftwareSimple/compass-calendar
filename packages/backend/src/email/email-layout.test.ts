import {
  extractLinksFromRenderedEmail,
  renderWelcomeEmail,
} from "@backend/email/email-layout";
import { describe, expect, it } from "bun:test";

describe("renderWelcomeEmail", () => {
  it("renders list-unsubscribe footer links when unsubscribe urls are provided", () => {
    const rendered = renderWelcomeEmail(
      "welcome",
      {
        subject: "Hello",
        preheader: "Preview line",
        heading: "Heading",
        paragraphs: ["One"],
        cta: { label: "Go", href: "https://app.example.com/start" },
      },
      {
        httpsUrl: "https://api.example.com/api/email/unsubscribe?token=abc",
        listUnsubscribeHeader:
          "<mailto:unsubscribe@mail.example.com>, <https://api.example.com/api/email/unsubscribe?token=abc>",
      },
    );

    expect(rendered.html).toContain("Unsubscribe");
    expect(rendered.html).toContain("token=abc");
    expect(rendered.text).toContain("Unsubscribe:");
  });

  it("renders html and text parts with utm-tagged links", () => {
    const rendered = renderWelcomeEmail("welcome", {
      subject: "Hello",
      preheader: "Preview line",
      heading: "Heading",
      paragraphs: ["One", "Two"],
      cta: {
        label: "Go",
        href: "https://app.example.com/start",
      },
    });

    expect(rendered.subject).toBe("Hello");
    expect(rendered.html).toContain("Heading");
    expect(rendered.text).toContain("Heading");
    const links = extractLinksFromRenderedEmail(rendered.html, rendered.text);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).toContain("utm_source=email");
      expect(link).toContain("utm_campaign=welcome");
      expect(link).toContain("utm_content=welcome");
    }
  });
});
