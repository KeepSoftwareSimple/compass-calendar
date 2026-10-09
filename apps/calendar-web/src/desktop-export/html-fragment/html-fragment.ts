import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import {
  DESCRIPTION_HTML_ALLOWED_ATTR,
  DESCRIPTION_HTML_ALLOWED_TAGS,
} from "@web/components/DescriptionEditor/description-html.policy";
import {
  looksLikeHtml,
  plainTextToDescriptionHtml,
} from "@web/components/DescriptionEditor/plain-text-description";

export type HtmlFragmentInline =
  | { kind: "text"; text: string }
  | { kind: "bold"; children: HtmlFragmentInline[] }
  | { kind: "italic"; children: HtmlFragmentInline[] }
  | { kind: "link"; href: string; children: HtmlFragmentInline[] }
  | { kind: "br" };

export type HtmlFragmentListItem = {
  inlines: HtmlFragmentInline[];
};

export type HtmlFragmentBlock =
  | { kind: "paragraph"; inlines: HtmlFragmentInline[] }
  | { kind: "unorderedList"; items: HtmlFragmentListItem[] }
  | { kind: "orderedList"; items: HtmlFragmentListItem[] }
  | { kind: "verbatim"; html: string };

export type HtmlFragmentDocument = {
  blocks: HtmlFragmentBlock[];
};

const jsdomWindow = new JSDOM("").window;
const purify = DOMPurify(jsdomWindow);

export const sanitizeDescriptionHtml = (html: string): string =>
  purify.sanitize(html, {
    ALLOWED_TAGS: DESCRIPTION_HTML_ALLOWED_TAGS,
    ALLOWED_ATTR: DESCRIPTION_HTML_ALLOWED_ATTR,
  });

export const normalizeDescriptionInput = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const html = looksLikeHtml(trimmed)
    ? trimmed
    : plainTextToDescriptionHtml(trimmed);
  return sanitizeDescriptionHtml(html);
};

const isSafeHttpHref = (href: string): boolean => {
  try {
    const url = new URL(href, "https://compass.invalid");
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const serializeInline = (inline: HtmlFragmentInline): string => {
  switch (inline.kind) {
    case "text":
      return escapeHtml(inline.text);
    case "bold":
      return `<strong>${inline.children.map(serializeInline).join("")}</strong>`;
    case "italic":
      return `<em>${inline.children.map(serializeInline).join("")}</em>`;
    case "link":
      return `<a href="${escapeHtml(inline.href)}">${inline.children.map(serializeInline).join("")}</a>`;
    case "br":
      return "<br>";
  }
};

const serializeList = (
  tag: "ul" | "ol",
  items: HtmlFragmentListItem[],
): string => {
  const listItems = items
    .map(
      (item) => `<li><p>${item.inlines.map(serializeInline).join("")}</p></li>`,
    )
    .join("");
  return `<${tag}>${listItems}</${tag}>`;
};

const serializeBlock = (block: HtmlFragmentBlock): string => {
  switch (block.kind) {
    case "paragraph":
      return `<p>${block.inlines.map(serializeInline).join("")}</p>`;
    case "unorderedList":
      return serializeList("ul", block.items);
    case "orderedList":
      return serializeList("ol", block.items);
    case "verbatim":
      return block.html;
  }
};

export const serializeHtmlFragmentDocument = (
  document: HtmlFragmentDocument,
): string => {
  if (document.blocks.length === 0) {
    return "";
  }
  return document.blocks.map(serializeBlock).join("");
};

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

const parseInlineChildren = (nodes: ChildNode[]): HtmlFragmentInline[] => {
  const inlines: HtmlFragmentInline[] = [];
  for (const node of nodes) {
    if (node.nodeType === TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text.length > 0) {
        inlines.push({ kind: "text", text });
      }
      continue;
    }
    if (node.nodeType !== ELEMENT_NODE) {
      continue;
    }
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (tag === "br") {
      inlines.push({ kind: "br" });
      continue;
    }
    if (tag === "strong" || tag === "b") {
      inlines.push({
        kind: "bold",
        children: parseInlineChildren(Array.from(element.childNodes)),
      });
      continue;
    }
    if (tag === "em" || tag === "i") {
      inlines.push({
        kind: "italic",
        children: parseInlineChildren(Array.from(element.childNodes)),
      });
      continue;
    }
    if (tag === "a") {
      const href = element.getAttribute("href") ?? "";
      if (!isSafeHttpHref(href)) {
        inlines.push(...parseInlineChildren(Array.from(element.childNodes)));
        continue;
      }
      inlines.push({
        kind: "link",
        href,
        children: parseInlineChildren(Array.from(element.childNodes)),
      });
      continue;
    }
    inlines.push({
      kind: "text",
      text: element.textContent ?? "",
    });
  }
  return inlines;
};

const parseListItems = (listElement: HTMLElement): HtmlFragmentListItem[] => {
  const items: HtmlFragmentListItem[] = [];
  for (const child of Array.from(listElement.children)) {
    if (child.tagName.toLowerCase() !== "li") {
      continue;
    }
    const paragraph = child.querySelector("p");
    const nodes = paragraph
      ? Array.from(paragraph.childNodes)
      : Array.from(child.childNodes);
    items.push({ inlines: parseInlineChildren(nodes) });
  }
  return items;
};

const parseStructuredBlocksFromSanitized = (
  html: string,
): HtmlFragmentBlock[] => {
  if (!html.trim()) {
    return [];
  }
  const dom = new JSDOM(`<body>${html}</body>`);
  const body = dom.window.document.body;
  const blocks: HtmlFragmentBlock[] = [];
  for (const node of Array.from(body.childNodes) as ChildNode[]) {
    if (node.nodeType === TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text.trim().length > 0) {
        blocks.push({
          kind: "paragraph",
          inlines: [{ kind: "text", text }],
        });
      }
      continue;
    }
    if (node.nodeType !== ELEMENT_NODE) {
      continue;
    }
    const element = node as HTMLElement;
    const tag = element.tagName.toLowerCase();
    if (tag === "p") {
      blocks.push({
        kind: "paragraph",
        inlines: parseInlineChildren(Array.from(element.childNodes)),
      });
      continue;
    }
    if (tag === "ul") {
      blocks.push({
        kind: "unorderedList",
        items: parseListItems(element),
      });
      continue;
    }
    if (tag === "ol") {
      blocks.push({
        kind: "orderedList",
        items: parseListItems(element),
      });
      continue;
    }
    blocks.push({
      kind: "verbatim",
      html: element.outerHTML,
    });
  }
  return blocks;
};

type StructuredBlockRange = { start: number; end: number };

const findStructuredBlockRanges = (html: string): StructuredBlockRange[] => {
  const ranges: StructuredBlockRange[] = [];
  const pattern = /<(p|ul|ol)(\s[^>]*)?>[\s\S]*?<\/\1>/gi;
  for (const match of html.matchAll(pattern)) {
    const start = match.index ?? 0;
    ranges.push({ start, end: start + match[0].length });
  }
  ranges.sort((a, b) => a.start - b.start);
  return ranges;
};

export const parseHtmlFragmentDocument = (
  rawHtml: string,
): HtmlFragmentDocument => {
  const html = rawHtml.trim();
  if (!html) {
    return { blocks: [] };
  }

  const ranges = findStructuredBlockRanges(html);
  if (ranges.length === 0) {
    const sanitized = sanitizeDescriptionHtml(html);
    if (!sanitized.trim()) {
      return { blocks: [] };
    }
    if (sanitized === html) {
      return { blocks: parseStructuredBlocksFromSanitized(sanitized) };
    }
    return { blocks: [{ kind: "verbatim", html }] };
  }

  const blocks: HtmlFragmentBlock[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      const chunk = html.slice(cursor, range.start);
      if (chunk.length > 0) {
        blocks.push({ kind: "verbatim", html: chunk });
      }
    }
    const slice = html.slice(range.start, range.end);
    blocks.push(
      ...parseStructuredBlocksFromSanitized(sanitizeDescriptionHtml(slice)),
    );
    cursor = range.end;
  }
  if (cursor < html.length) {
    blocks.push({ kind: "verbatim", html: html.slice(cursor) });
  }
  return { blocks };
};

export const roundTripDescriptionHtml = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const document = parseHtmlFragmentDocument(trimmed);
  return serializeHtmlFragmentDocument(document);
};

export const plainTextFromDocument = (
  document: HtmlFragmentDocument,
): string => {
  const parts: string[] = [];
  for (const block of document.blocks) {
    switch (block.kind) {
      case "paragraph":
        parts.push(
          block.inlines
            .map((inline) => {
              switch (inline.kind) {
                case "text":
                  return inline.text;
                case "br":
                  return "\n";
                default:
                  return serializeInline(inline).replace(/<[^>]+>/g, "");
              }
            })
            .join(""),
        );
        break;
      case "unorderedList":
      case "orderedList":
        for (const item of block.items) {
          parts.push(
            item.inlines
              .map((inline) => (inline.kind === "text" ? inline.text : ""))
              .join(""),
          );
        }
        break;
      case "verbatim":
        parts.push(block.html.replace(/<[^>]+>/g, " "));
        break;
    }
  }
  return parts.join("\n").replace(/\s+/g, " ").trim();
};
