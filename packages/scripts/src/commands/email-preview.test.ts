import { runEmailPreview } from "@scripts/commands/email-preview";
import { WELCOME_SEQUENCE } from "@backend/email/welcome-sequence";
import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("runEmailPreview", () => {
  const dirs: string[] = [];

  afterEach(() => {
    dirs.length = 0;
  });

  it("writes one html and text file pair per welcome step", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "email-preview-"));
    dirs.push(outputDir);
    runEmailPreview({ outputDir });

    const files = readdirSync(outputDir).sort();
    expect(files).toHaveLength(WELCOME_SEQUENCE.length * 2);
    for (const step of WELCOME_SEQUENCE) {
      const html = readFileSync(join(outputDir, `${step.key}.html`), "utf8");
      const text = readFileSync(join(outputDir, `${step.key}.txt`), "utf8");
      expect(html.length).toBeGreaterThan(0);
      expect(text.length).toBeGreaterThan(0);
      expect(html).toContain("utm_content=");
    }
  });
});
