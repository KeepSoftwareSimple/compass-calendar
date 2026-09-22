import { renderWelcomeEmail } from "@backend/email/email-layout";
import { WELCOME_SEQUENCE } from "@backend/email/welcome-sequence";
import { getWelcomeEmailContent } from "@backend/email/welcome-sequence.content";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type EmailPreviewOptions = {
  outputDir: string;
};

export function runEmailPreview(options: EmailPreviewOptions): void {
  mkdirSync(options.outputDir, { recursive: true });

  for (const step of WELCOME_SEQUENCE) {
    const content = getWelcomeEmailContent(step.key);
    if (!content) {
      throw new Error(`Missing welcome content for step ${step.key}`);
    }
    const rendered = renderWelcomeEmail(step.key, content);
    const baseName = `${step.key}`;
    writeFileSync(
      join(options.outputDir, `${baseName}.html`),
      rendered.html,
      "utf8",
    );
    writeFileSync(
      join(options.outputDir, `${baseName}.txt`),
      rendered.text,
      "utf8",
    );
  }
}

export async function runEmailPreviewCommand(args: string[]): Promise<void> {
  const outputFlagIndex = args.indexOf("--output");
  const outputDir =
    outputFlagIndex >= 0 ? args[outputFlagIndex + 1] : "tmp/email-preview";
  if (!outputDir) {
    throw new Error("--output requires a directory path");
  }
  runEmailPreview({ outputDir });
  console.log(
    `Wrote ${WELCOME_SEQUENCE.length} welcome email previews to ${outputDir}`,
  );
}
