import { Resvg } from "@resvg/resvg-js";
import { PDFDocument, PDFString } from "pdf-lib";
import { DEFAULT_LIFESPAN, getCompletedLifeWeeks } from "@core/life/life-math";
import { escapeHtml } from "@core/util/escape-html.util";
import { reflectionLifeProgress } from "@backend/email/reflection-life-progress";
import { fileURLToPath } from "node:url";

const fontPath = fileURLToPath(
  new URL("./assets/Rubik-Regular.ttf", import.meta.url),
);
const PAGE_WIDTH = 600;
const LIFE_URL_LEFT = 24;
const LIFE_URL_BASELINE = 101;
const LIFE_URL_FONT_SIZE = 14;
const LIFE_URL_HIT_PAD = 6;

function lifeUrlLinkRect(pageHeight: number) {
  const top = LIFE_URL_BASELINE - LIFE_URL_FONT_SIZE;
  const bottom = LIFE_URL_BASELINE + LIFE_URL_HIT_PAD;
  return [
    LIFE_URL_LEFT,
    pageHeight - bottom,
    PAGE_WIDTH - 25,
    pageHeight - top,
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
  const height = 146 + rows * 8;
  const text = (x: number, y: number, content: string, size = 14) =>
    `<text x="${x}" y="${y}" font-family="Rubik" font-weight="400" font-size="${size}" fill="#222">${escapeHtml(content)}</text>`;
  const grid = Array.from({ length: rows }, (_, year) => {
    const label =
      year === 0 || (year + 1) % 10 === 0
        ? text(12, 126 + year * 8, String(year + 1), 9)
        : "";
    return (
      label +
      Array.from({ length: 52 }, (_, week) => {
        const index = year * 52 + week;
        return `<rect x="${38 + week * 10.3}" y="${119 + year * 8}" width="6" height="6" rx="1" fill="${index < completed ? "#222" : "#e5e5e5"}"${index === completed ? ' stroke="#222" stroke-width="1.5"' : ""}/>`;
      }).join("")
    );
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${height}" viewBox="0 0 ${PAGE_WIDTH} ${height}">
    <rect width="${PAGE_WIDTH}" height="${height}" fill="white"/>
    ${text(24, 30, "Your Life In Weeks", 16)}
    ${text(24, 53, "Each square is a week")}
    ${text(24, 77, reflectionLifeProgress(completed))}
    ${text(LIFE_URL_LEFT, LIFE_URL_BASELINE, `${visibleUrl.host.replace(/^www\./, "")}${visibleUrl.pathname}`)}
    ${grid}
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
        fontFiles: [fontPath],
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
    Rect: lifeUrlLinkRect(height),
    Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of(targetUrl.toString()) },
  });
  page.node.addAnnot(document.context.register(link));
  return Buffer.from(await document.save());
}
