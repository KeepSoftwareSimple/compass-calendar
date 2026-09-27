import { useEffect } from "react";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { PUBLIC_SHORTCUT_CATALOG } from "@web/shortcuts/shortcuts-catalog.data";

export const SHORTCUTS_PAGE_TITLE = "Compass keyboard shortcuts";
export const SHORTCUTS_PAGE_DESCRIPTION =
  "Every Compass keyboard shortcut for Week, Day, and Life, the same catalog as the in-app legend.";

const DEFAULT_DOCUMENT_TITLE = "Compass Calendar";

/**
 * Printable `/shortcuts` page. Statically imported from the router, not
 * lazily, so the catalog stays in the eager graph and does not add a chunk or
 * an `import()` root (#3704).
 *
 * The rows below deliberately do not reuse ShortcutSection / ShortcutList /
 * ShortcutKeys, which render the same catalog inside the app. Two reasons,
 * both measured rather than assumed:
 *
 * - ShortcutList pulls Tooltip and the billing Pro badge in, and because this
 *   page is eager that lands @floating-ui/react (~65 kB) plus two chunks in
 *   the boot set, which fails the boot-size budget. The badge and tooltip are
 *   for locked write shortcuts; the public catalog has neither.
 * - ShortcutKeys marks every keycap `aria-hidden`, which is right for a hint
 *   beside a visible label and wrong here: on this page the keys are the
 *   content, so they stay in plain `<kbd>` elements a screen reader reads.
 *
 * `shortcuts.menu.test.ts` is what keeps the two in step: both render the same
 * PUBLIC_SHORTCUT_CATALOG snapshot, and that test fails when the snapshot
 * drifts from the registry.
 */
export const ShortcutsCatalogView = () => {
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
        {PUBLIC_SHORTCUT_CATALOG.map((section, index) =>
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
