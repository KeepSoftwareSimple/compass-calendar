import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";
import { PixelCompass } from "@web/components/PixelCompass/PixelCompass";

/**
 * The "we are exchanging your code" screen every OAuth return lands on.
 * Provider and Apple callbacks show the same panel, so it lives here rather
 * than twice in the view files.
 */
export function AuthCallbackOverlay() {
  return (
    <OverlayPanel
      title="Just finishing up …"
      message="Returning you to Compass."
      role="status"
      variant="status"
      icon={<PixelCompass className="h-12 w-12" />}
    />
  );
}
