import { PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import { getCompletedLifeWeeks } from "@core/life/life-math";
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
  it("renders a self-contained 1200px PNG with a simple white grid and percentage", () => {
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
      "https://example.com/life",
    );
    expect(svg).toContain("100% done (79-year average)</text>");
    expect(svg).toContain(
      'font-size="14" fill="#222">100% done (79-year average)</text>',
    );
    expect(svg).toContain("Your Life In Weeks");
    expect(svg).toContain("https://example.com/life");
    expect(svg).not.toMatch(/font-size="(?:18|24)"/);
    expect(svg).toContain("Each dot is a week of your life.");
    expect(svg.indexOf("Filled: lived.")).toBeLessThan(svg.indexOf('y="161"'));
    expect(svg).toContain('fill="white"');
    expect(svg).not.toContain("completed weeks");
    expect(svg).not.toContain("U.S. reference");
    expect(svg).not.toContain("prediction");
    expect(svg).not.toContain("A closer look");
    expect(svg.match(/<rect /g)).toHaveLength(79 * 52 + 1);
    expect(svg).not.toContain("weeks remaining");
  });
  it("wraps the image in one PDF page with a direct clickable Life View link", async () => {
    const url = "https://example.com/life";
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
    const action = link.lookup(PDFName.of("A"), PDFDict);
    expect(action.lookup(PDFName.of("S"), PDFName).toString()).toBe("/URI");
    expect(action.lookup(PDFName.of("URI"), PDFString).decodeText()).toBe(url);
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
    ).toContain("42% done (79-year average)</text>");
  });
});
