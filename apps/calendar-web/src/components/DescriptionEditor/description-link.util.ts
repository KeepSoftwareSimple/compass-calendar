import { type Editor } from "@tiptap/react";
import { openExternalUrl } from "@web/common/utils/browser/open-external-url.util";
import { copyText } from "@web/common/utils/clipboard/clipboard.util";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import { getDescriptionLinkInteraction } from "@web/components/DescriptionEditor/description-link-interaction.ref";

const DESCRIPTION_LINK_COPIED_TOAST_ID = "description-link-copied";

const LINK_SELECTOR = "a[href]";

/** Screen-reader label without a native `title` tooltip (custom chrome shows the href). */
export const applyDescriptionLinkAccessibleLabel = (
  link: HTMLAnchorElement,
): void => {
  const href = link.href;
  const visible = link.textContent?.trim() ?? "";
  const label = visible && visible !== href ? `${visible}, ${href}` : href;
  if (link.getAttribute("aria-label") !== label) {
    link.setAttribute("aria-label", label);
  }
  if (link.hasAttribute("title")) {
    link.removeAttribute("title");
  }
};

/** Host-only label for display; stored href and link text stay unchanged. */
export const displayHostForDescriptionLink = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const looksLikeBareUrlLabel = (value: string): boolean =>
  value.startsWith("http://") ||
  value.startsWith("https://") ||
  value.startsWith("www.");

const stripTrailingLinkPunctuation = (value: string): string =>
  value.replace(/[.,)>]+$/, "");

/** True when the visible label is the URL itself (autolink or provider HTML). */
export const shouldShortenDescriptionLinkLabel = (
  text: string,
  href: string,
): boolean => {
  const trimmed = text.trim();
  if (!trimmed || !href) return false;
  if (trimmed.includes(" ")) return false;
  try {
    const parsed = new URL(href);
    const normalizedHref = stripTrailingLinkPunctuation(parsed.href);
    const normalizedText = stripTrailingLinkPunctuation(trimmed);
    if (
      normalizedText === normalizedHref ||
      normalizedText === stripTrailingLinkPunctuation(href)
    ) {
      return true;
    }
    return looksLikeBareUrlLabel(trimmed);
  } catch {
    return looksLikeBareUrlLabel(trimmed);
  }
};

export const openDescriptionLink = (url: string): void => {
  if (!url) return;
  openExternalUrl(url);
};

/** The nearest enclosing link, `node` itself included. */
const closestLink = (node: Node | null): HTMLAnchorElement | null => {
  if (!(node instanceof Element)) return null;
  const link = node.closest(LINK_SELECTOR);
  return link instanceof HTMLAnchorElement ? link : null;
};

export const findLinkElement = (
  root: HTMLElement,
  target: EventTarget | null,
): HTMLAnchorElement | null =>
  target instanceof HTMLElement && root.contains(target)
    ? closestLink(target)
    : null;

export const copyDescriptionLinkUrl = async (url: string): Promise<boolean> => {
  const didCopy = await copyText(url);
  if (didCopy) {
    showStatusToast(DESCRIPTION_LINK_COPIED_TOAST_ID, "Link copied");
  }
  return didCopy;
};

/**
 * Runs `mutate` with ProseMirror's DOM observer paused. Link chrome decorates
 * ProseMirror-owned <a> nodes (tabindex, title, focus ring, short labels);
 * if ProseMirror sees those writes it redraws the links, and a redraw that
 * re-triggers the decorator loops forever and freezes the tab.
 */
export const withEditorDomObserverPaused = (
  editor: Editor,
  mutate: () => void,
): void => {
  const domObserver = (
    editor.view as unknown as {
      domObserver: { stop: () => void; start: () => void };
    }
  ).domObserver;
  domObserver.stop();
  try {
    mutate();
  } finally {
    domObserver.start();
  }
};

export const listDescriptionLinks = (root: HTMLElement): HTMLAnchorElement[] =>
  [...root.querySelectorAll<HTMLAnchorElement>(LINK_SELECTOR)].filter(
    (link) => link.href.length > 0,
  );

export const linkAtCaret = (editor: Editor): HTMLAnchorElement | null => {
  const { view } = editor;
  const { node } = view.domAtPos(view.state.selection.from);
  // domAtPos can land on a text node; only elements carry `closest`.
  return closestLink(
    node.nodeType === Node.TEXT_NODE ? node.parentElement : node,
  );
};

export const resolveDescriptionLinkTarget = (
  editor: Editor,
  root: HTMLElement,
  eventTarget: EventTarget | null,
): HTMLAnchorElement | null => {
  const fromEvent =
    findLinkElement(root, eventTarget) ??
    findLinkElement(root, document.activeElement);
  if (fromEvent?.href) return fromEvent;

  const interaction = getDescriptionLinkInteraction();
  if (interaction?.href && root.contains(interaction)) return interaction;

  const caretLink = linkAtCaret(editor);
  if (caretLink?.href) return caretLink;

  const links = listDescriptionLinks(root);
  return links[0] ?? null;
};

export const resolveDescriptionLinkToCopy = (
  editor: Editor,
  root: HTMLElement,
  eventTarget: EventTarget | null,
): string | null =>
  resolveDescriptionLinkTarget(editor, root, eventTarget)?.href ?? null;

export const focusAdjacentDescriptionLink = (
  root: HTMLElement,
  current: HTMLAnchorElement,
  direction: "prev" | "next",
): boolean => {
  const links = listDescriptionLinks(root);
  const index = links.indexOf(current);
  if (index === -1) return false;
  const nextIndex = direction === "next" ? index + 1 : index - 1;
  const target = links[nextIndex];
  if (!target) return false;
  target.focus();
  return true;
};
