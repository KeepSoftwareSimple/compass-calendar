import { useEffect } from "react";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import catalogJson from "@web/shortcuts/shortcuts-catalog.json";
import { type ShortcutOverlaySection } from "@web/shortcuts/shortcuts-overlay.types";

export const SHORTCUTS_PAGE_TITLE = "Compass keyboard shortcuts";
export const SHORTCUTS_PAGE_DESCRIPTION =
  "Every Compass keyboard shortcut for Week, Day, and Life, the same catalog as the in-app legend.";

const DEFAULT_DOCUMENT_TITLE = "Compass Calendar";

// Snapshot of getPublicShortcutCatalog(). Static JSON so /shortcuts stays in
// this boot module and does not add a chunk or an import() root (#3704).
const catalog = catalogJson as ShortcutOverlaySection[];

/**
 * Public printable catalog. Mounted from the unmatched-path module so the
 * week boot graph does not grow a second route root.
 */
export const ShortcutsPage = () => {
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
        {catalog.map((section, index) =>
          section.shortcuts.length === 0 ? null : (
            <section
              key={section.id}
              className={
                index === 0
                  ? "mb-6 last:mb-0"
                  : "mt-6 mb-6 border-border/60 border-t pt-5 last:mb-0"
              }
            >
              <h2 className="mb-3 font-bold text-sm text-text leading-tight">
                {section.title}
              </h2>
              <ul className="space-y-1.5">
                {section.shortcuts.map((shortcut) => (
                  <li
                    key={`${shortcut.keys.join("-")}-${shortcut.label}`}
                    className="flex min-h-9 items-center justify-between gap-4 py-1.5 text-[13px] text-text leading-tight"
                  >
                    <span className="min-w-0 flex-1 break-words">
                      {shortcut.label}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: keycap sequences repeat keys; position is the identity
                        <kbd key={`${key}-${keyIndex}`} className="c-keycap">
                          {key}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ),
        )}
      </main>
    </div>
  );
};
