import { MODAL_DISMISS_MS } from "@web/common/constants/motion.constants";
import { useDismissTransition } from "@web/common/hooks/useDismissTransition";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";
import { PixelPirate } from "./PixelPirate";
import { useFlashedWelcomeShortcut } from "./useFlashedWelcomeShortcut";
import { WelcomeGuideBody } from "./WelcomeGuideBody";
import { welcomeGuideActions } from "./welcome.guide.store";

export function WelcomeGuideModal() {
  const { closing, beginDismiss } = useDismissTransition(MODAL_DISMISS_MS);
  const flashedKey = useFlashedWelcomeShortcut();

  const dismiss = () => {
    beginDismiss(() => welcomeGuideActions.close());
  };

  return (
    <OverlayPanel
      align="start"
      ariaLabel="Welcome to Compass Calendar"
      backdropClassName="overflow-y-auto py-8"
      closing={closing}
      onDismiss={dismiss}
      widthClassName="w-120"
    >
      <div className="flex w-full flex-col gap-6">
        <PixelPirate className="h-14 w-14 shrink-0" />
        <WelcomeGuideBody flashedKey={flashedKey}>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={dismiss}
              className="c-button c-button-primary c-button-elevated inline-flex items-center justify-center rounded-full px-10"
            >
              Close
              <ShortcutHint className="ml-2">Esc</ShortcutHint>
            </button>
          </div>
        </WelcomeGuideBody>
      </div>
    </OverlayPanel>
  );
}
