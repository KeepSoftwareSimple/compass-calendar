import { useEffect } from "react";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { DEFAULT_DOCUMENT_TITLE } from "@web/components/DocumentTitle/formatDocumentTitle";
import { ShortcutSection } from "@web/components/Shortcuts/ShortcutOverlay/ShortcutSection";
import { getPublicShortcutCatalog } from "@web/shortcuts/shortcuts.registry";

export const SHORTCUTS_PAGE_TITLE = "Compass keyboard shortcuts";
export const SHORTCUTS_PAGE_DESCRIPTION =
  "Every Compass keyboard shortcut for Week, Day, and Life, the same catalog as the in-app legend.";

function useShortcutsPageDocument() {
  useEffect(() => {
    const previousTitle = document.title;
    const meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta?.getAttribute("content");
    document.title = SHORTCUTS_PAGE_TITLE;
    meta?.setAttribute("content", SHORTCUTS_PAGE_DESCRIPTION);
    return () => {
      document.title = previousTitle || DEFAULT_DOCUMENT_TITLE;
      if (!meta) return;
      if (previousDescription == null) {
        meta.removeAttribute("content");
        return;
      }
      meta.setAttribute("content", previousDescription);
    };
  }, []);
}

export function ShortcutsPage() {
  useShortcutsPageDocument();
  const sections = getPublicShortcutCatalog();

  return (
    <div
      data-document-scroll
      data-shortcuts-print
      className="min-h-dvh bg-background text-text"
    >
      <header
        data-shortcuts-print-chrome
        className="flex items-center justify-between border-border border-b px-4 py-3"
      >
        <a
          href={ROOT_ROUTES.ROOT}
          className="c-focus-ring text-sm text-text-muted hover:text-text"
        >
          Compass Calendar
        </a>
        <button
          type="button"
          className="c-focus-ring text-sm text-text-muted hover:text-text"
          onClick={() => window.print()}
        >
          Print
        </button>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-col px-4 py-10">
        <h1 className="mb-2 font-medium text-3xl text-text">
          {SHORTCUTS_PAGE_TITLE}
        </h1>
        <p className="mb-8 text-sm text-text-muted">
          The same catalog as the in-app legend. Press ? in Compass to search
          it.
        </p>
        {sections.map((section, index) => (
          <ShortcutSection
            key={section.id}
            isFirst={index === 0}
            title={section.title}
            shortcuts={section.shortcuts}
          />
        ))}
      </main>
    </div>
  );
}
