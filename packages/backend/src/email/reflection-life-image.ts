import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_LIFESPAN, getCompletedLifeWeeks } from "@core/life/life-math";
import { escapeHtml } from "@core/util/escape-html.util";
import { reflectionLifeProgress } from "@backend/email/reflection-life-progress";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(
  new URL("./assets/Rubik-Variable.ttf", import.meta.url),
);

// Keep the Life View grid, with a plain white background for the attachment.
export function renderReflectionLifeSvg(birthDate: string, date: string) {
  const completed = getCompletedLifeWeeks(birthDate, date);
  const rows = DEFAULT_LIFESPAN;
  const height = 104 + rows * 8;
  const text = (x: number, y: number, content: string, size = 12) =>
    `<text x="${x}" y="${y}" font-family="Rubik" font-weight="400" font-size="${size}" fill="#222">${escapeHtml(content)}</text>`;
  const grid = Array.from({ length: rows }, (_, year) => {
    const label =
      year === 0 || (year + 1) % 10 === 0
        ? text(12, 78 + year * 8, String(year + 1), 9)
        : "";
    return (
      label +
      Array.from({ length: 52 }, (_, week) => {
        const index = year * 52 + week;
        return `<rect x="${38 + week * 10.3}" y="${71 + year * 8}" width="6" height="6" rx="1" fill="${index < completed ? "#222" : "#e5e5e5"}"${index === completed ? ' stroke="#222" stroke-width="1.5"' : ""}/>`;
      }).join("")
    );
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${height}" viewBox="0 0 600 ${height}">
    <rect width="600" height="${height}" fill="white"/>
    ${text(24, 29, reflectionLifeProgress(completed), 18)}
    ${text(24, 50, "Each dot is a week.")}
    ${grid}
    ${text(24, 92 + rows * 8, "Filled: lived. Outlined: this week.")}
  </svg>`;
}

export function renderReflectionLifePng(
  birthDate: string,
  date: string,
): Buffer {
  return Buffer.from(
    new Resvg(renderReflectionLifeSvg(birthDate, date), {
      fitTo: { mode: "width", value: 1200 },
      font: {
        fontFiles: [fontPath],
        loadSystemFonts: false,
        defaultFontFamily: "Rubik",
      },
    })
      .render()
      .asPng(),
  );
}
