import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from "@floating-ui/react";
import { Copy } from "@phosphor-icons/react/dist/csr/Copy";
import { type Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { KEYMAP } from "@core/shortcuts/keymap";
import {
  copyDescriptionLinkUrl,
  findLinkElement,
  listDescriptionLinks,
  withEditorDomObserverPaused,
} from "@web/components/DescriptionEditor/description-link.util";
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
          link.title !== link.href ||
          !link.classList.contains("c-focus-ring") ||
          !link.classList.contains("rounded-xs"),
      );
      if (links.length === 0) return;
      withEditorDomObserverPaused(editor, () => {
        for (const link of links) {
          if (link.getAttribute("tabindex") !== "0") {
            link.setAttribute("tabindex", "0");
          }
          if (link.title !== link.href) link.title = link.href;
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
    placement: "right-start",
    middleware: [offset(4), flip(), shift({ padding: 4 })],
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
      <div className="flex items-center gap-1 rounded-xs bg-surface-panel px-1 py-0.5 shadow-sm">
        <ShortcutKeys
          keys={[...KEYMAP.openDescriptionLinkAtCaret.keycaps]}
          className="pointer-coarse:inline-flex"
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
      </div>
    </div>
  );
};
