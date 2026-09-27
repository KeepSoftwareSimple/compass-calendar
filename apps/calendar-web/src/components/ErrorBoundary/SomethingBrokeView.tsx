import { reloadLocation } from "@web/common/utils/browser/browser-navigation.util";
import { PixelPirate } from "@web/components/WelcomeModal/PixelPirate";

/**
 * Recovery surface rendered by {@link ErrorBoundary} after a render-phase throw
 * unmounts the app. Deliberately self-contained: it renders in place of the
 * whole tree, so it must not depend on the router, theme, or query providers
 * that were torn down. Borrows the BackendDownView pirate styling and offers a
 * full reload as the only reliable way back.
 */
interface SomethingBrokeViewProps {
  message?: string;
}

export const SomethingBrokeView = ({
  message = "Something broke and the crew has been alerted.",
}: SomethingBrokeViewProps) => (
  <div className="c-not-found gap-4 px-6 text-center">
    <PixelPirate className="h-20 w-20" />

    <h1 className="font-[VT323,monospace] text-4xl">🏴‍☠️ We ran aground!</h1>

    <p className="max-w-xl text-text-muted text-xl">{message}</p>
    <p className="max-w-xl text-text-muted text-xl">
      Reload to get your calendar back.
    </p>

    <button
      type="button"
      // The reload button is the page's only action; seat focus so recovery
      // is one Enter away.
      // biome-ignore lint/a11y/noAutofocus: single-action recovery screen
      autoFocus
      onClick={() => reloadLocation()}
      className="mt-5 cursor-pointer rounded border-2 border-border bg-accent-secondary px-4 py-2 font-semibold text-[16px] text-on-accent transition-all duration-200 ease-in-out hover:brightness-120 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
    >
      Reload the app
    </button>
  </div>
);
