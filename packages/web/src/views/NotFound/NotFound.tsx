import { ROOT_ROUTES } from "@web/common/constants/routes";
import { ShortcutsPage } from "@web/components/ShortcutsPage/ShortcutsPage";

/**
 * Public unmatched paths and `/shortcuts` share this module so the printable
 * catalog does not add a boot chunk or a new `import()` root (#3704).
 */
export const NotFoundView = () => {
  if (window.location.pathname === ROOT_ROUTES.SHORTCUTS) {
    return <ShortcutsPage />;
  }

  return (
    <div className="c-not-found">
      <div>
        <span className="relative text-4xl">🏴‍☠️ Shiver me timbers! </span>
      </div>

      <div>
        <span className="relative text-xxl">
          This isn't part of the app, matey
        </span>
      </div>

      <a
        href={ROOT_ROUTES.ROOT}
        className="mt-5 mb-5 inline-block cursor-pointer rounded border-2 border-border bg-accent-secondary px-4 py-2 font-semibold text-[16px] text-on-accent transition-all duration-200 ease-in-out hover:brightness-120"
      >
        Go back to your booty
      </a>
    </div>
  );
};
