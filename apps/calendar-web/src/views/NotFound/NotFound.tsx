import { ArrowLeftIcon } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { Link, useNavigate } from "@tanstack/react-router";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import { PixelPirateScouting } from "@web/components/WelcomeModal/PixelPirateScouting";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

export const NotFoundView = () => {
  const navigate = useNavigate();

  useAppShortcut("Escape", () => {
    void navigate({ to: ROOT_ROUTES.ROOT });
  });

  return (
    <main className="flex h-dvh w-full overflow-y-auto bg-background p-4 text-text sm:p-8">
      <div className="m-auto w-full max-w-lg rounded-2xl border border-border bg-surface p-3 sm:p-4">
        <div
          role="img"
          aria-label="404"
          className="flex h-48 items-center justify-center gap-2 rounded-xl border border-border bg-surface-panel text-accent sm:h-52 sm:gap-4"
        >
          <span className="font-[VT323,monospace] text-8xl leading-none sm:text-9xl">
            4
          </span>
          <div className="grid size-24 place-items-center rounded-full border-2 border-border-strong border-dashed bg-background sm:size-28">
            <PixelPirateScouting className="size-16 sm:size-20 motion-safe:[animation-iteration-count:2]" />
          </div>
          <span className="font-[VT323,monospace] text-8xl leading-none sm:text-9xl">
            4
          </span>
        </div>

        <div className="flex flex-col items-center px-3 pt-6 pb-5 text-center sm:px-6 sm:pt-8 sm:pb-7">
          <h1 className="font-semibold text-3xl tracking-tight sm:text-[2rem]">
            Cap’n, we’re lost.
          </h1>
          <p className="mt-2 max-w-xs text-sm text-text-muted leading-relaxed">
            This page drifted out to sea.
          </p>
          <Link
            to={ROOT_ROUTES.ROOT}
            aria-keyshortcuts="Escape"
            className="c-button c-button-primary mt-6 gap-2 rounded-md motion-reduce:transition-none"
          >
            <ArrowLeftIcon aria-hidden="true" size={16} />
            Back to calendar
            <ShortcutKeys className="ml-1" keys="Esc" />
          </Link>
        </div>
      </div>
    </main>
  );
};
