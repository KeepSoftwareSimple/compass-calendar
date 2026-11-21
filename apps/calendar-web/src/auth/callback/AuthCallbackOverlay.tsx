import { useLayoutEffect, useRef } from "react";
import { cloneBootShell } from "@web/common/utils/boot/boot-shell.util";
import { OverlayPanel } from "@web/components/OverlayPanel/OverlayPanel";
import { PixelCompass } from "@web/components/PixelCompass/PixelCompass";

/**
 * The "we are exchanging your code" screen every OAuth return lands on.
 * Provider and Apple callbacks show the same panel, so it lives here rather
 * than twice in the view files.
 *
 * The boot skeleton stays behind the panel, so the return reads as one
 * continuous calendar load instead of skeleton, blank page, then calendar.
 */
export function AuthCallbackOverlay() {
  const backdropRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const backdrop = backdropRef.current;
    const skeleton = cloneBootShell();
    if (!backdrop || !skeleton) return;
    backdrop.replaceChildren(skeleton);
    return () => backdrop.replaceChildren();
  }, []);

  return (
    <>
      <div aria-hidden="true" ref={backdropRef} />
      <OverlayPanel
        title="Just finishing up …"
        message="Returning you to Compass."
        role="status"
        variant="status"
        icon={<PixelCompass className="h-12 w-12" />}
      />
    </>
  );
}
