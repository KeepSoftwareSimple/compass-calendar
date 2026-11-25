import { useEffect, useRef } from "react";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@web/components/Tooltip/Tooltip";
import { PixelPirate } from "@web/components/WelcomeModal/PixelPirate";
import {
  LIFE_VIEW_INTRO_BODY,
  LIFE_VIEW_INTRO_PRIMARY_LABEL,
  LIFE_VIEW_INTRO_QUOTE,
  LIFE_VIEW_INTRO_TITLE,
} from "@web/views/Life/life-view-intro.util";
import { type LifeViewIntroState } from "@web/views/Life/useLifeViewIntro";

type LifeViewIntroModalProps = Pick<
  LifeViewIntroState,
  "mounted" | "closing" | "dismiss"
>;

export function LifeViewIntroModal({
  mounted,
  closing,
  dismiss,
}: LifeViewIntroModalProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!mounted) return;
    primaryRef.current?.focus();
  }, [mounted]);

  if (!mounted) return null;

  return (
    <OverlayPanel
      align="start"
      ariaLabel={LIFE_VIEW_INTRO_TITLE}
      backdropClassName="overflow-y-auto py-8"
      closing={closing}
      initialFocusRef={primaryRef}
      onDismiss={() => dismiss("escape")}
      panelClassName="max-w-full gap-4 border border-border bg-surface text-text shadow-xl"
      widthClassName="w-120"
    >
      <div className="flex w-full flex-col gap-6">
        <Tooltip placement="right">
          <TooltipTrigger asChild>
            <button
              aria-label="A quote from Oliver Burkeman"
              type="button"
              className="w-fit cursor-help rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
            >
              <PixelPirate className="size-14" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-60">
            <blockquote>“{LIFE_VIEW_INTRO_QUOTE}”</blockquote>
            <p className="mt-1 text-text-muted">Oliver Burkeman</p>
          </TooltipContent>
        </Tooltip>
        <div className="flex w-full flex-col gap-2">
          <h1 className="font-[VT323,monospace] text-4xl text-text leading-none">
            {LIFE_VIEW_INTRO_TITLE}
          </h1>
          <p className="text-text-muted">{LIFE_VIEW_INTRO_BODY}</p>
        </div>
        <button
          className="c-button c-button-primary c-button-elevated inline-flex h-10 w-full items-center justify-center rounded-full"
          onClick={() => dismiss("primary")}
          ref={primaryRef}
          type="button"
        >
          {LIFE_VIEW_INTRO_PRIMARY_LABEL}
          <ShortcutKeys className="ml-2" keys="Enter" />
        </button>
      </div>
    </OverlayPanel>
  );
}
