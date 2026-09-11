import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";

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
      icon={
        <div
          className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-text"
          aria-hidden="true"
        />
      }
    />
  );
}
