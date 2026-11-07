import { Resvg } from "@resvg/resvg-js";
import { PDFDocument, PDFString } from "pdf-lib";
import { DEFAULT_LIFESPAN, getCompletedLifeWeeks } from "@core/life/life-math";
import { LIFE_PDF_QUOTE } from "@core/life/life-quotes";
import { escapeHtml } from "@core/util/escape-html.util";
import { fileURLToPath } from "node:url";

const fontPaths = ["Rubik-Regular.ttf", "Rubik-SemiBold.ttf"].map((name) =>
  fileURLToPath(new URL(`./assets/${name}`, import.meta.url)),
);
const PAGE_WIDTH = 600;
const GRID_TOP = 119;
const ROW_PITCH = 8;
const WEEK_COL_PITCH = 10.3;
const DOT_SIZE = 6;
const FOOTER_RESERVE = 48;
const QUOTE_WRAP_CHARS = 35;
const GRID_INK = "#222";
const GRID_EMPTY = "#e5e5e5";
const LIFE_URL_INSET_X = 24;
const LIFE_URL_BASELINE_FROM_BOTTOM = 18;
const LIFE_URL_FONT_SIZE = 12;
const LIFE_URL_HIT_PAD = 6;

function lifeUrlLinkRect() {
  return [
    LIFE_URL_INSET_X,
    LIFE_URL_BASELINE_FROM_BOTTOM - LIFE_URL_HIT_PAD,
    PAGE_WIDTH - LIFE_URL_INSET_X,
    LIFE_URL_BASELINE_FROM_BOTTOM + LIFE_URL_FONT_SIZE,
  ];
}

// Keep the Life View grid, with a plain white background for the attachment.
export function renderReflectionLifeSvg(
  birthDate: string,
  date: string,
  lifeUrl: string,
) {
  const visibleUrl = new URL(lifeUrl);
  const completed = getCompletedLifeWeeks(birthDate, date);
  const rows = DEFAULT_LIFESPAN;
  const height = GRID_TOP + rows * ROW_PITCH + FOOTER_RESERVE;
  const text = (
    x: number,
    y: number,
    content: string,
    size = 14,
    weight = 400,
    anchor = "start",
  ) =>
    `<text x="${x}" y="${y}" font-family="Rubik" font-weight="${weight}" font-size="${size}" text-anchor="${anchor}" fill="${GRID_INK}">${escapeHtml(content)}</text>`;
  const quoteLines: string[] = [];
  for (const word of LIFE_PDF_QUOTE.split(/\s+/)) {
    const last = quoteLines.length - 1;
    if (last < 0 || `${quoteLines[last]} ${word}`.length > QUOTE_WRAP_CHARS)
      quoteLines.push(word);
    else quoteLines[last] += ` ${word}`;
  }
  const grid = Array.from({ length: rows }, (_, year) => {
    const label =
      year === 0 || (year + 1) % 10 === 0
        ? text(12, GRID_TOP + 7 + year * ROW_PITCH, String(year + 1), 9)
        : "";
    return (
      label +
      Array.from({ length: 52 }, (_, week) => {
        const index = year * 52 + week;
        return `<rect x="${38 + week * WEEK_COL_PITCH}" y="${GRID_TOP + year * ROW_PITCH}" width="${DOT_SIZE}" height="${DOT_SIZE}" rx="1" fill="${index < completed ? GRID_INK : GRID_EMPTY}"${index === completed ? ` stroke="${GRID_INK}" stroke-width="1.5"` : ""}/>`;
      }).join("")
    );
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${height}" viewBox="0 0 ${PAGE_WIDTH} ${height}">
    <rect width="${PAGE_WIDTH}" height="${height}" fill="white"/>
    ${text(38, 42, "Your Life", 24, 600)}
    ${text(38, 71, "In Weeks", 24, 600)}
    <line x1="235" y1="22" x2="235" y2="86" stroke="#ddd"/>
    ${quoteLines.map((line, index) => text(270, 35 + index * 21, line)).join("")}
    ${grid}
    ${text(PAGE_WIDTH / 2, height - LIFE_URL_BASELINE_FROM_BOTTOM, `${visibleUrl.host.replace(/^www\./, "")}${visibleUrl.pathname}`, LIFE_URL_FONT_SIZE, 400, "middle")}
  </svg>`;
}

export function renderReflectionLifePng(
  birthDate: string,
  date: string,
  lifeUrl: string,
): Buffer {
  return Buffer.from(
    new Resvg(renderReflectionLifeSvg(birthDate, date, lifeUrl), {
      fitTo: { mode: "width", value: 1200 },
      font: {
        fontFiles: fontPaths,
        loadSystemFonts: false,
        defaultFontFamily: "Rubik",
      },
    })
      .render()
      .asPng(),
  );
}

export async function renderReflectionLifePdf(
  birthDate: string,
  date: string,
  lifeUrl: string,
): Promise<Buffer> {
  const targetUrl = new URL(lifeUrl);
  targetUrl.searchParams.set("utm_source", "email");
  targetUrl.searchParams.set("utm_campaign", "weekly_review");
  targetUrl.searchParams.set("utm_content", "life_view_attachment");
  const document = await PDFDocument.create();
  document.setTitle("Your Life In Weeks");
  document.setCreationDate(new Date(`${date}T00:00:00Z`));
  document.setModificationDate(new Date(`${date}T00:00:00Z`));
  const image = await document.embedPng(
    renderReflectionLifePng(birthDate, date, lifeUrl),
  );
  const width = image.width / 2,
    height = image.height / 2;
  const page = document.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });
  const link = document.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: lifeUrlLinkRect(),
    Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of(targetUrl.toString()) },
  });
  page.node.addAnnot(document.context.register(link));
  return Buffer.from(await document.save());
}
