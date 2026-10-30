import { autoUpdate, useFloating } from "@floating-ui/react";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { type Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { KEYMAP } from "@core/shortcuts/keymap";
import {
  applyDescriptionLinkAccessibleLabel,
  copyDescriptionLinkUrl,
  findLinkElement,
  listDescriptionLinks,
  withEditorDomObserverPaused,
} from "@web/components/DescriptionEditor/description-link.util";
import {
  DESCRIPTION_LINK_CHROME_PLACEMENT,
  descriptionLinkChromeMiddleware,
} from "@web/components/DescriptionEditor/description-link-chrome-floating";
import { setDescriptionLinkInteraction } from "@web/components/DescriptionEditor/description-link-interaction.ref";
import IconButton from "@web/components/IconButton/IconButton";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";

const COPY_ICON_SIZE = 14;
const HOVER_CLOSE_DELAY_MS = 150;

interface DescriptionEditorLinkChromeProps {
  editor: Editor;
  editorRoot: HTMLElement | null;
}

export const DescriptionEditorLinkChrome = ({
  editor,
  editorRoot,
}: DescriptionEditorLinkChromeProps) => {
  const [activeLink, setActiveLink] = useState<HTMLAnchorElement | null>(null);
  const [pinnedLink, setPinnedLink] = useState<HTMLAnchorElement | null>(null);
  const clearHoverTimeoutRef = useRef<number | null>(null);
  const floatingRef = useRef<HTMLDivElement | null>(null);

  const chromeLink = activeLink ?? pinnedLink;

  const cancelClearHover = useCallback(() => {
    if (clearHoverTimeoutRef.current !== null) {
      window.clearTimeout(clearHoverTimeoutRef.current);
      clearHoverTimeoutRef.current = null;
    }
  }, []);

  const scheduleClearHover = useCallback(() => {
    cancelClearHover();
    clearHoverTimeoutRef.current = window.setTimeout(() => {
      setPinnedLink(null);
    }, HOVER_CLOSE_DELAY_MS);
  }, [cancelClearHover]);

  useEffect(() => {
    if (!editorRoot) return;

    // Write only what is missing, with ProseMirror's observer paused: an
    // unconditional write that ProseMirror sees makes it redraw the links,
    // which fires this observer again (an endless loop with two or more
    // links in one paragraph, e.g. a booking's "Cancel | Reschedule").
    const syncTabIndex = () => {
      const links = listDescriptionLinks(editorRoot).filter(
        (link) =>
          link.getAttribute("tabindex") !== "0" ||
          !link.hasAttribute("aria-label") ||
          link.hasAttribute("title") ||
          !link.classList.contains("c-focus-ring") ||
          !link.classList.contains("rounded-xs"),
      );
      if (links.length === 0) return;
      withEditorDomObserverPaused(editor, () => {
        for (const link of links) {
          if (link.getAttribute("tabindex") !== "0") {
            link.setAttribute("tabindex", "0");
          }
          applyDescriptionLinkAccessibleLabel(link);
          if (!link.classList.contains("c-focus-ring")) {
            link.classList.add("c-focus-ring");
          }
          if (!link.classList.contains("rounded-xs")) {
            link.classList.add("rounded-xs");
          }
        }
      });
    };

    syncTabIndex();

    const onFocusIn = (event: FocusEvent) => {
      setActiveLink(findLinkElement(editorRoot, event.target));
    };

    const linkAfterLeave = (relatedTarget: EventTarget | null) =>
      relatedTarget instanceof Node && editorRoot.contains(relatedTarget)
        ? findLinkElement(editorRoot, relatedTarget)
        : null;

    const onFocusOut = (event: FocusEvent) => {
      setActiveLink(linkAfterLeave(event.relatedTarget));
    };

    const onPointerOver = (event: PointerEvent) => {
      const link = findLinkElement(editorRoot, event.target);
      if (!link) return;
      cancelClearHover();
      setPinnedLink(link);
    };

    const onPointerOut = (event: PointerEvent) => {
      const nextLink = linkAfterLeave(event.relatedTarget);
      if (nextLink) {
        cancelClearHover();
        setPinnedLink(nextLink);
        return;
      }

      if (
        event.relatedTarget instanceof Node &&
        floatingRef.current?.contains(event.relatedTarget)
      ) {
        return;
      }

      scheduleClearHover();
    };

    editorRoot.addEventListener("focusin", onFocusIn);
    editorRoot.addEventListener("focusout", onFocusOut);
    editorRoot.addEventListener("pointerover", onPointerOver);
    editorRoot.addEventListener("pointerout", onPointerOut);

    const observer = new MutationObserver(syncTabIndex);
    observer.observe(editorRoot, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["href"],
    });

    return () => {
      editorRoot.removeEventListener("focusin", onFocusIn);
      editorRoot.removeEventListener("focusout", onFocusOut);
      editorRoot.removeEventListener("pointerover", onPointerOver);
      editorRoot.removeEventListener("pointerout", onPointerOut);
      observer.disconnect();
      cancelClearHover();
    };
  }, [cancelClearHover, editor, editorRoot, scheduleClearHover]);

  const { refs, floatingStyles } = useFloating({
    open: Boolean(chromeLink),
    placement: DESCRIPTION_LINK_CHROME_PLACEMENT,
    middleware: editorRoot ? descriptionLinkChromeMiddleware(editorRoot) : [],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    if (chromeLink) {
      refs.setReference(chromeLink);
    }
  }, [chromeLink, refs]);

  useEffect(() => {
    setDescriptionLinkInteraction(chromeLink);
    return () => setDescriptionLinkInteraction(null);
  }, [chromeLink]);

  if (!chromeLink) return null;

  const copyUrl = () => copyDescriptionLinkUrl(chromeLink.href);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: keeps the editor focused when pressing the copy control beside a link mark.
    <div
      ref={(node) => {
        floatingRef.current = node;
        refs.setFloating(node);
      }}
      className="z-10"
      style={floatingStyles}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerEnter={cancelClearHover}
      onPointerLeave={scheduleClearHover}
    >
      <fieldset
        aria-label="Link shortcut and copy"
        className="flex max-w-[min(100%,18rem)] items-center gap-1.5 rounded-xs border-0 bg-surface-panel p-0 px-2 py-1 text-xs shadow-sm"
      >
        <span className="min-w-0 truncate text-text-muted">
          {chromeLink.href}
        </span>
        <span className="shrink-0 text-text-muted" aria-hidden="true">
          ·
        </span>
        <ShortcutKeys
          keys={[...KEYMAP.openDescriptionLinkAtCaret.keycaps]}
          className="pointer-coarse:inline-flex shrink-0"
        />
        <IconButton
          aria-label="Copy link"
          size="small"
          type="button"
          onClick={() => {
            void copyUrl();
          }}
        >
          <Copy size={COPY_ICON_SIZE} />
        </IconButton>
      </fieldset>
    </div>
  );
};
