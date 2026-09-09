const HTML_TAG_PATTERN = /<(p|br|a|ul|ol|b|i|strong|em|div)\b/i;

export const looksLikeHtml = (value: string): boolean =>
  HTML_TAG_PATTERN.test(value);

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const linkifyUrls = (text: string): string =>
  text.replace(/https?:\/\/[^\s]+/g, (match) => {
    let url = match;
    let suffix = "";
    while (url.length > 0 && /[.,)>]$/.test(url)) {
      suffix = url.slice(-1) + suffix;
      url = url.slice(0, -1);
    }
    if (!url) {
      return match;
    }
    return `<a href="${url}">${url}</a>${suffix}`;
  });

const paragraphToHtml = (block: string): string =>
  block
    .split("\n")
    .map((line) => linkifyUrls(escapeHtml(line)))
    .join("<br>");

export const plainTextToDescriptionHtml = (value: string): string =>
  value
    .split(/\n\s*\n/)
    .map((block) => `<p>${paragraphToHtml(block.trim())}</p>`)
    .join("");
