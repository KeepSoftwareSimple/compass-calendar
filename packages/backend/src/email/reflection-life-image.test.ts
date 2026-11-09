import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
} from "pdf-lib";
import {
  DEFAULT_LIFESPAN,
  getCompletedLifeWeeks,
  WEEKS_PER_ROW,
} from "@core/life/life-math";
import { LIFE_PDF_QUOTE } from "@core/life/life-quotes";
import {
  renderReflectionLifePdf,
  renderReflectionLifePng,
  renderReflectionLifeSvg,
} from "@backend/email/reflection-life-image";
import { describe, expect, it } from "bun:test";

describe("reflection life image", () => {
  it("fills a slot only when a real week completes", () => {
    expect(getCompletedLifeWeeks("2000-01-01", "2000-01-07")).toBe(0);
    expect(getCompletedLifeWeeks("2000-01-01", "2000-01-08")).toBe(1);
    expect(getCompletedLifeWeeks("2000-01-01", "2000-01-09")).toBe(1);
    expect(getCompletedLifeWeeks("2000-01-01", "2000-01-15")).toBe(2);
  });
  it("renders a self-contained 1200px PNG with a two-column header and a centered footer link", () => {
    const png = renderReflectionLifePng(
      "2000-01-01",
      "2026-11-02",
      "https://example.com/life",
    );
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.length).toBeLessThan(500_000);
    const svg = renderReflectionLifeSvg(
      "1900-01-01",
      "2026-11-02",
      "https://www.compasscalendar.com/life?utm_source=email",
    );
    expect(svg).not.toContain("% done");
    expect(svg).not.toContain("year average");
    expect(svg).toContain('font-weight="600" font-size="24"');
    expect(svg).toContain(">Your Life</text>");
    expect(svg).toContain(">In Weeks</text>");
    const quoteText = [...svg.matchAll(/<text x="270"[^>]*>([^<]*)<\/text>/g)]
      .map((match) => match[1])
      .join(" ");
    expect(quoteText).toBe(LIFE_PDF_QUOTE);
    expect(svg).toContain('x="300" y="781"');
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain(">compasscalendar.com/life</text>");
    expect(svg).not.toContain("https://");
    const visibleText = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
      .map((match) => match[1])
      .join("\n");
    expect(visibleText).not.toContain("www.");
    expect(svg).not.toContain("utm_");
    expect(svg).not.toContain("Each square");
    expect(svg).not.toContain("Filled:");
    expect(svg).not.toContain("Outlined:");
    expect(svg).toContain('fill="white"');
    expect(svg).not.toContain("completed weeks");
    expect(svg).not.toContain("U.S. reference");
    expect(svg).not.toContain("prediction");
    expect(svg).not.toContain("A closer look");
    expect(svg.match(/<rect /g)).toHaveLength(
      DEFAULT_LIFESPAN * WEEKS_PER_ROW + 1,
    );
    expect(svg).not.toContain("weeks remaining");
  });
  it("wraps the image in one PDF page with a direct clickable Life View link", async () => {
    const url = "https://example.com/life?view=weeks#now";
    const bytes = await renderReflectionLifePdf(
      "1993-09-14",
      "2026-11-05",
      url,
    );
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.length).toBeLessThan(500_000);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    const page = pdf.getPage(0);
    const annotations = page.node.Annots()!;
    expect(annotations.size()).toBe(1);
    const link = annotations.lookup(0, PDFDict);
    expect(link.lookup(PDFName.of("Subtype"), PDFName).toString()).toBe(
      "/Link",
    );
    const bounds = link.lookup(PDFName.of("Rect"), PDFArray);
    const left = bounds.lookup(0, PDFNumber).asNumber();
    const bottom = bounds.lookup(1, PDFNumber).asNumber();
    const right = bounds.lookup(2, PDFNumber).asNumber();
    const top = bounds.lookup(3, PDFNumber).asNumber();
    expect((left + right) / 2).toBe(page.getWidth() / 2);
    expect(bottom).toBeGreaterThanOrEqual(0);
    expect(top).toBeLessThan(40);
    const action = link.lookup(PDFName.of("A"), PDFDict);
    expect(action.lookup(PDFName.of("S"), PDFName).toString()).toBe("/URI");
    const target = new URL(
      action.lookup(PDFName.of("URI"), PDFString).decodeText(),
    );
    expect(target.origin + target.pathname).toBe("https://example.com/life");
    expect(target.searchParams.get("view")).toBe("weeks");
    expect(target.hash).toBe("#now");
    expect(target.searchParams.get("utm_source")).toBe("email");
    expect(target.searchParams.get("utm_campaign")).toBe("weekly_review");
    expect(target.searchParams.get("utm_content")).toBe("life_view_attachment");
  });
  it("fills exactly one additional grid slot after seven days", () => {
    const filled = (date: string) =>
      renderReflectionLifeSvg(
        "2000-01-01",
        date,
        "https://example.com/life",
      ).match(/<rect [^>]*fill="#222"/g)?.length ?? 0;
    expect(filled("2000-01-07")).toBe(0);
    expect(filled("2000-01-08")).toBe(1);
    expect(filled("2000-01-15")).toBe(2);
    expect(
      renderReflectionLifeSvg(
        "1993-09-14",
        "2026-11-05",
        "https://example.com/life",
      ),
    ).not.toContain("% done");
  });
});
