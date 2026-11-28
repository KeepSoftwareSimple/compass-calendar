import {
  looksLikeHtml,
  plainTextToDescriptionHtml,
} from "@web/components/DescriptionEditor/plain-text-description";
import { describe, expect, it } from "bun:test";

describe("looksLikeHtml", () => {
  it("returns true for HTML paragraph content", () => {
    expect(looksLikeHtml("<p>x</p>")).toBe(true);
  });

  it("returns false for less-than comparisons in plain text", () => {
    expect(looksLikeHtml("a < b")).toBe(false);
  });
});

describe("plainTextToDescriptionHtml", () => {
  it("turns booking descriptions into three paragraphs with linked URLs", () => {
    const input =
      "Recovered\n\nCancel: https://x/meet/cancel/1?token=a\n\nReschedule: https://x/meet/reschedule/1?token=b";
    const html = plainTextToDescriptionHtml(input);

    expect(html).toBe(
      '<p>Recovered</p><p>Cancel: <a href="https://x/meet/cancel/1?token=a">https://x/meet/cancel/1?token=a</a></p><p>Reschedule: <a href="https://x/meet/reschedule/1?token=b">https://x/meet/reschedule/1?token=b</a></p>',
    );
  });

  it("turns a single newline into separate paragraphs", () => {
    expect(plainTextToDescriptionHtml("line one\nline two")).toBe(
      "<p>line one</p><p>line two</p>",
    );
  });

  it("escapes script tags in plain text instead of rendering them", () => {
    const html = plainTextToDescriptionHtml("<script>alert(1)</script>");

    expect(html).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
    expect(html).not.toContain("<script");
  });

  // Pins the whole escaping contract, not just angle brackets, so this path
  // cannot silently keep a weaker encoder than @core/util/escape-html.util.
  it("escapes ampersands and quotes through the shared encoder", () => {
    expect(plainTextToDescriptionHtml(`Tom & "Jerry" <b>`)).toBe(
      "<p>Tom &amp; &quot;Jerry&quot; &lt;b&gt;</p>",
    );
  });
});
