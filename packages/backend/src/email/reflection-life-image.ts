import { Resvg } from "@resvg/resvg-js";
import {
  DEFAULT_LIFESPAN,
  getCompletedLifeWeeks,
  getTotalLifeDots,
} from "@core/life/life-math";
import { escapeHtml } from "@core/util/escape-html.util";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(
  new URL("./assets/Rubik-Variable.ttf", import.meta.url),
);

// Life View's default Light Beach palette, with an opaque background for email.
const colors = {
  background: "#f3eee2",
  text: "#403a2f",
  accent: "#2b2a27",
  ahead: "#d8d3c8",
  current: "#9c7d45",
};

export function renderReflectionLifeSvg(birthDate: string, date: string) {
  const completed = getCompletedLifeWeeks(birthDate, date);
  const total = getTotalLifeDots(DEFAULT_LIFESPAN);
  const rows = DEFAULT_LIFESPAN;
  const current = Math.min(completed, total - 1);
  const row = Math.floor(current / 52);
  const width = 600;
  const height = 210 + rows * 8;
  const text = (x: number, y: number, content: string, size = 14) =>
    `<text x="${x}" y="${y}" font-family="Rubik" font-size="${size}" fill="${colors.text}">${escapeHtml(content)}</text>`;
  const dot = (index: number, x: number, y: number, size: number) =>
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="1" fill="${index === completed ? colors.current : index < completed ? colors.accent : colors.ahead}"/>`;
  const grid = Array.from({ length: rows }, (_, year) => {
    const label =
      year === 0 || (year + 1) % 10 === 0
        ? text(12, 113 + year * 8, String(year + 1), 9)
        : "";
    return (
      label +
      Array.from({ length: 52 }, (_, week) =>
        dot(year * 52 + week, 38 + week * 10.3, 106 + year * 8, 6),
      ).join("")
    );
  }).join("");
  const zoomY = 125 + rows * 8;
  const zoom = Array.from({ length: 52 }, (_, week) =>
    dot(row * 52 + week, 38 + week * 10.3, zoomY + 10, 8),
  ).join("");
  const latestWeek =
    completed > 0 &&
    completed <= total &&
    Math.floor((completed - 1) / 52) === row
      ? `<path d="M${42 + ((completed - 1) % 52) * 10.3} ${zoomY + 24}l-3 5h6z" fill="${colors.accent}"/>`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="600" height="${height}" fill="${colors.background}"/>
    ${text(24, 33, "Your life in weeks", 24)}
    ${text(24, 59, `${completed.toLocaleString("en-US")} completed weeks · ${date}`, 16)}
    ${text(24, 83, "Each dot is a week. Each row is 52 weeks.", 12)}
    ${grid}
    ${text(24, zoomY, `A closer look: row ${row + 1}`, 13)}${zoom}${latestWeek}
    ${text(24, zoomY + 49, "Dark: completed   Gold: current   Light: ahead", 12)}
    ${text(24, zoomY + 68, "79-year U.S. reference (CDC, 2024). An assumption, not a prediction.", 11)}
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
