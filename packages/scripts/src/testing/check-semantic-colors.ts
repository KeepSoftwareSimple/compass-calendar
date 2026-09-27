import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const webSource = join(import.meta.dir, "../../../../apps/calendar-web/src");
const sourceExtensions = new Set([".css", ".ts", ".tsx"]);
const rawColorUtility =
  /(?:bg|text|border|ring|outline|placeholder|divide|from|to|via)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?(?:\/\d{1,3})?|darkBlue-\d{2,3})/g;
const rawColorTheme =
  /--color-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?/g;

function getSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return getSourceFiles(path);
    return sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf(".")))
      ? [path]
      : [];
  });
}

const violations = getSourceFiles(webSource).flatMap((path) => {
  const source = readFileSync(path, "utf8");
  const matches = [
    ...source.matchAll(rawColorUtility),
    ...source.matchAll(rawColorTheme),
  ];
  return matches.map((match) => {
    const line = source.slice(0, match.index).split("\n").length;
    return `${relative(process.cwd(), path)}:${line} uses ${match[0]}`;
  });
});

if (violations.length > 0) {
  console.error(
    "Raw Tailwind colors are not allowed. Use semantic Compass colors:",
  );
  console.error(violations.join("\n"));
  process.exit(1);
}
