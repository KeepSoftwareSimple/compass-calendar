import { getCompletedLifeWeeks } from "@core/life/life-math";
import {
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
  it("renders a self-contained 1200px PNG with reference and exact count", () => {
    const png = renderReflectionLifePng("2000-01-01", "2026-11-02");
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.length).toBeLessThan(500_000);
    const svg = renderReflectionLifeSvg("1900-01-01", "2026-11-02");
    expect(svg).toContain("not a prediction");
    expect(svg).toContain(
      getCompletedLifeWeeks("1900-01-01", "2026-11-02").toLocaleString("en-US"),
    );
    expect(svg).not.toContain("weeks remaining");
  });
});
