import { type Editor } from "@tiptap/react";
import { openExternalUrl } from "@web/common/utils/browser/open-external-url.util";
import { copyText } from "@web/common/utils/clipboard/clipboard.util";
import { showStatusToast } from "@web/common/utils/toast/status-toast.util";
import { physicalDigitIndex } from "@web/shortcuts/digit-pick.util";
import { hasCommandModifier } from "@web/shortcuts/keyboard-modifiers.util";

const DESCRIPTION_LINK_COPIED_TOAST_ID = "description-link-copied";
export const DESCRIPTION_LINK_SHORTCUT_COUNT = 9;
/** Inline space reserved after each link for digit keycaps (matches c-description-link-hints). */
export const DESCRIPTION_LINK_HINT_SLOT_PX = 28;

const LINK_SELECTOR = "a[href]";

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

export const tryOpenDescriptionLinkFromDigit = (
  event: Pick<KeyboardEvent, "code" | "key" | "metaKey" | "ctrlKey" | "altKey">,
  editorRoot: HTMLElement,
): boolean => {
  if (hasCommandModifier(event)) return false;

  const digitIndex = physicalDigitIndex(event);
  if (digitIndex === null || digitIndex >= DESCRIPTION_LINK_SHORTCUT_COUNT) {
    return false;
  }

  const link = listDescriptionLinks(editorRoot)[digitIndex];
  if (!link?.href) return false;

  openDescriptionLink(link.href);
  return true;
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

export const resolveDescriptionLinkToCopy = (
  editor: Editor,
  root: HTMLElement,
  activeLink: HTMLAnchorElement | null,
): string | null => {
  if (activeLink?.href) return activeLink.href;
  const caretLink = linkAtCaret(editor);
  if (caretLink?.href) return caretLink.href;
  const links = listDescriptionLinks(root);
  return links[0]?.href ?? null;
};

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
