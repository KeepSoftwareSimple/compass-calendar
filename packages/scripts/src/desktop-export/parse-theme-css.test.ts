import {
  parseCssColor,
  parseThemeCss,
  SEMANTIC_THEME_TOKENS,
} from "@scripts/desktop-export/parse-theme-css";
import { INDEX_CSS_PATH } from "@scripts/desktop-export/paths";
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

describe("parse-theme-css", () => {
  it("parses hex and modern hsl colors", () => {
    const hex = parseCssColor("#f3eee2");
    expect(hex.red).toBeCloseTo(0.953, 3);
    expect(hex.alpha).toBe(1);

    const hsl = parseCssColor("hsl(0 0 100 / 7%)");
    expect(hsl.alpha).toBeCloseTo(0.07, 3);
    expect(hsl.red).toBeCloseTo(1, 3);
  });

  it("extracts 22 semantic tokens for both themes from index.css", () => {
    const css = readFileSync(INDEX_CSS_PATH, "utf8");
    const parsed = parseThemeCss(css);
    for (const theme of ["light-beach", "dark-abyss"] as const) {
      expect(Object.keys(parsed[theme])).toHaveLength(
        SEMANTIC_THEME_TOKENS.length,
      );
      for (const token of SEMANTIC_THEME_TOKENS) {
        expect(parsed[theme][token].alpha).toBeGreaterThan(0);
      }
    }
  });
});
