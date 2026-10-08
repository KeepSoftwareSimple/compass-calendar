import {
  type HtmlFragmentDocument,
  normalizeDescriptionInput,
  parseHtmlFragmentDocument,
  plainTextFromDocument,
  roundTripDescriptionHtml,
} from "@web/desktop-export/html-fragment/html-fragment";

type HtmlFragmentVectorCase = {
  id: string;
  input: { html: string };
  output: {
    normalized: string;
    roundTrip: string;
    plainText: string;
    document: HtmlFragmentDocument;
  };
};

const buildCase = (id: string, html: string): HtmlFragmentVectorCase => {
  const normalized = normalizeDescriptionInput(html);
  const document = parseHtmlFragmentDocument(html);
  return {
    id,
    input: { html },
    output: {
      normalized,
      roundTrip: roundTripDescriptionHtml(html),
      plainText: plainTextFromDocument(document),
      document,
    },
  };
};

export const buildHtmlFragmentFixtures = () => ({
  cases: [
    buildCase("empty", ""),
    buildCase("plain-paragraph", "<p>Hello world</p>"),
    buildCase(
      "bold-italic-link",
      '<p>Meet at <strong>HQ</strong> with <em>team</em>, <a href="https://example.com/join">Join</a></p>',
    ),
    buildCase("bullet-list", "<ul><li><p>One</p></li><li><p>Two</p></li></ul>"),
    buildCase(
      "ordered-list",
      "<ol><li><p>First</p></li><li><p>Second</p></li></ol>",
    ),
    buildCase(
      "plain-text-booking",
      "Recovered\n\nCancel: https://x/meet/cancel/1?token=a\n\nReschedule: https://x/meet/reschedule/1?token=b",
    ),
    buildCase(
      "strip-script",
      '<p onclick="alert(1)">Safe<script>alert(1)</script></p>',
    ),
    buildCase(
      "unsafe-link",
      '<p><a href="javascript:alert(1)">click me</a></p>',
    ),
    buildCase(
      "verbatim-custom-tag",
      '<p>Notes</p><custom data-id="1">Keep me</custom>',
    ),
    buildCase("line-breaks", "<p>line one<br>line two</p>"),
  ],
});

export const emitHtmlFragmentFixturesJson = (): string =>
  `${JSON.stringify(buildHtmlFragmentFixtures(), null, 2)}\n`;
