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

export const plainTextToDescriptionHtml = (value: string): string =>
  value
    .split(/\n\s*\n/)
    .flatMap((block) => {
      const trimmed = block.trim();
      if (!trimmed) {
        return [];
      }
      return trimmed
        .split("\n")
        .map((line) => `<p>${linkifyUrls(escapeHtml(line))}</p>`);
    })
    .join("");

// Flattens description HTML to readable text for compact previews. Block ends
// and <br> become spaces so list items do not run together.
export const descriptionToPlainText = (value: string): string => {
  if (!looksLikeHtml(value)) {
    return value.trim();
  }
  const doc = new DOMParser().parseFromString(
    value.replace(/<\/(p|li|div|ul|ol)>|<br\s*\/?>/gi, " $&"),
    "text/html",
  );
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
};
